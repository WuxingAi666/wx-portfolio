"""Safe persistence: FAISS binary + JSON documents, never unpickle uploads."""
import hashlib
import json
import logging
import os
import shutil
import tempfile
from pathlib import Path

import faiss
from langchain_community.docstore.in_memory import InMemoryDocstore
from langchain_community.document_loaders import TextLoader
from langchain_community.vectorstores import FAISS
from langchain_core.documents import Document
from langchain_text_splitters import RecursiveCharacterTextSplitter

from app.config import Settings
from app.embeddings import embedding_identity

logger = logging.getLogger(__name__)


class KnowledgeIndex:
    def __init__(self, settings: Settings, embeddings):
        self.settings = settings
        self.embeddings = embeddings
        self.store = None
        self.fingerprint = ""
        self.document_count = 0
        self.chunk_count = 0
        self.dimension = 0

    def _input(self):
        # A manifest ties public documents to user-visible website sections.
        manifest = json.loads((self.settings.data_dir / "manifest.json").read_text(encoding="utf-8"))
        digest = hashlib.sha256()
        digest.update(json.dumps({
            "schema": 3,
            "chunk_context": "person_and_document_title_v1",
            "embedding": embedding_identity(self.settings),
            "chunk_size": self.settings.chunk_size,
            "chunk_overlap": self.settings.chunk_overlap,
            "manifest": manifest,
        }, sort_keys=True).encode())
        for item in manifest:
            path = (self.settings.data_dir / item["file"]).resolve()
            if not path.is_relative_to(self.settings.data_dir.resolve()) or path.suffix != ".txt":
                raise ValueError("Invalid public document path")
            digest.update(path.read_bytes())
        return manifest, digest.hexdigest()

    def initialize(self, force=False):
        manifest, fingerprint = self._input()
        snapshot = self.settings.storage_dir / "indexes" / fingerprint
        if snapshot.exists() and not force:
            try:
                self._load(snapshot, fingerprint)
                return
            except Exception:
                logger.warning("index_load_failed rebuilding=true")
        docs = []
        splitter = RecursiveCharacterTextSplitter(
            chunk_size=self.settings.chunk_size,
            chunk_overlap=self.settings.chunk_overlap,
            separators=["\n\n", "\n", "。", "；", "，", " ", ""],
            add_start_index=True,
        )
        for item in manifest:
            loaded = TextLoader(str(self.settings.data_dir / item["file"]), encoding="utf-8").load()
            # Never propagate local filesystem paths through the public API.
            for doc in loaded:
                doc.metadata = {"title": item["title"], "anchor": item["anchor"], "document_id": item["id"]}
            chunks = splitter.split_documents(loaded)
            # Each chunk must retain whose project it belongs to. Otherwise a
            # technical paragraph separated from its heading loses that context
            # in its embedding, and generic profile summaries can outrank it.
            for chunk in chunks:
                chunk.page_content = "【仵星的公开资料：" + item["title"] + "】\n" + chunk.page_content
            docs.extend(chunks)
        if not docs:
            raise ValueError("Public knowledge is empty")
        store = FAISS.from_documents(
            docs, self.embeddings, normalize_L2=True,
        )
        snapshot.parent.mkdir(parents=True, exist_ok=True)
        staging = Path(tempfile.mkdtemp(prefix="index-", dir=snapshot.parent))
        try:
            faiss.write_index(store.index, str(staging / "vectors.faiss"))
            payload = [
                {"id": store.index_to_docstore_id[i],
                 "text": store.docstore.search(store.index_to_docstore_id[i]).page_content,
                 "metadata": store.docstore.search(store.index_to_docstore_id[i]).metadata}
                for i in range(store.index.ntotal)
            ]
            (staging / "documents.json").write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
            metadata = {
                "fingerprint": fingerprint, "document_count": len(manifest),
                "chunk_count": len(docs), "dimension": store.index.d,
                "files": {name: hashlib.sha256((staging / name).read_bytes()).hexdigest()
                          for name in ("vectors.faiss", "documents.json")},
            }
            (staging / "metadata.json").write_text(json.dumps(metadata), encoding="utf-8")
            # A single worker owns indexing. No in-place writes to a serving index.
            if snapshot.exists():
                shutil.rmtree(snapshot)
            os.replace(staging, snapshot)
        finally:
            if staging.exists():
                shutil.rmtree(staging)
        self._load(snapshot, fingerprint)
        logger.info("index_built documents=%d chunks=%d dimension=%d", self.document_count, self.chunk_count, self.dimension)

    def _load(self, snapshot, fingerprint):
        metadata = json.loads((snapshot / "metadata.json").read_text(encoding="utf-8"))
        if metadata["fingerprint"] != fingerprint:
            raise ValueError("Index fingerprint mismatch")
        for name, expected in metadata["files"].items():
            if name not in {"vectors.faiss", "documents.json"}:
                raise ValueError("Invalid index file")
            if hashlib.sha256((snapshot / name).read_bytes()).hexdigest() != expected:
                raise ValueError("Index checksum mismatch")
        rows = json.loads((snapshot / "documents.json").read_text(encoding="utf-8"))
        index = faiss.read_index(str(snapshot / "vectors.faiss"))
        if index.ntotal != len(rows) or index.d != metadata["dimension"]:
            raise ValueError("Index shape mismatch")
        self.store = FAISS(
            self.embeddings, index,
            InMemoryDocstore({row["id"]: Document(page_content=row["text"], metadata=row["metadata"]) for row in rows}),
            {i: row["id"] for i, row in enumerate(rows)},
            normalize_L2=True,
        )
        self.fingerprint = fingerprint
        self.document_count = metadata["document_count"]
        self.chunk_count = index.ntotal
        self.dimension = index.d

    async def search(self, question):
        matches = await self.store.asimilarity_search_with_score(question, k=self.settings.top_k)
        # For unit vectors: squared L2 = 2 - 2*cosine. Higher cosine is better.
        return [(doc, max(-1., min(1., 1. - float(distance) / 2.))) for doc, distance in matches]
