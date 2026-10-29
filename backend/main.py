import argparse
import uvicorn


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="启动作品集 RAG 服务")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8010)
    args = parser.parse_args()
    uvicorn.run(
        "app.api:create_app", factory=True, host=args.host, port=args.port,
        workers=1, proxy_headers=False, access_log=False,
    )
