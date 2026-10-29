import os
from langchain_core.embeddings import Embeddings
from langchain_openai import OpenAIEmbeddings
from app.config import Settings


def build_embeddings(settings: Settings) -> Embeddings:
    if settings.embedding_provider == "local_bge":
        # Optional import: the default API image does not install PyTorch.
        os.environ.setdefault("HF_ENDPOINT", settings.hf_endpoint)
        from langchain_huggingface import HuggingFaceEmbeddings
        return HuggingFaceEmbeddings(
            model_name=settings.local_embedding_model,
            model_kwargs={"device": "cpu"},
            encode_kwargs={"normalize_embeddings": True},
        )
    return OpenAIEmbeddings(
        model=settings.embedding_api_model,
        base_url=settings.embedding_base_url,
        api_key=settings.embedding_api_key.get_secret_value(),
        check_embedding_ctx_length=False,
        chunk_size=16,
        timeout=settings.upstream_timeout,
        max_retries=1,
    )


def embedding_identity(settings: Settings) -> dict:
    return {
        "provider": settings.embedding_provider,
        "model": settings.local_embedding_model if settings.embedding_provider == "local_bge" else settings.embedding_api_model,
        "endpoint": settings.embedding_base_url if settings.embedding_provider != "local_bge" else "local",
        "metric": "normalized_l2_to_cosine_v1",
    }
