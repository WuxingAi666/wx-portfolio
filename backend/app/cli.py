import argparse
import json
import logging
from app.config import get_settings
from app.embeddings import build_embeddings
from app.index import KnowledgeIndex


def main():
    parser = argparse.ArgumentParser(description="作品集知识索引管理（仅服务器管理员执行）")
    parser.add_argument("command", choices=["index", "info"])
    args = parser.parse_args()
    settings = get_settings()
    logging.basicConfig(level=logging.INFO)
    index = KnowledgeIndex(settings, build_embeddings(settings))
    index.initialize()
    print(json.dumps({
        "documents": index.document_count, "chunks": index.chunk_count,
        "dimension": index.dimension, "fingerprint": index.fingerprint,
    }, indent=2))


if __name__ == "__main__":
    main()
