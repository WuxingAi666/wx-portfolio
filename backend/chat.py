"""Terminal client for the standalone RAG API; start main.py first."""
import argparse
import json
import urllib.error
import urllib.request


def main():
    parser = argparse.ArgumentParser(description="RAG 终端问答（先启动 main.py）")
    parser.add_argument('--api', default='http://127.0.0.1:8010', help='API 基址，不含 /api/v1/qa')
    args = parser.parse_args()
    history = []
    print('RAG 问答：输入 /clear 清空上下文，/exit 退出。')
    while True:
        try:
            question = input('\n你：').strip()
        except (EOFError, KeyboardInterrupt):
            print('\n已退出。')
            return
        if question == '/exit':
            return
        if question == '/clear':
            history.clear()
            print('上下文已清空。')
            continue
        if not question:
            continue
        if len(question) > 600:
            print('问题请控制在 600 字以内。')
            continue
        payload = json.dumps({'question': question, 'history': history}).encode('utf-8')
        request = urllib.request.Request(args.api.rstrip('/') + '/api/v1/qa', data=payload,
                                         headers={'Content-Type': 'application/json'})
        try:
            with urllib.request.urlopen(request, timeout=100) as response:
                result = json.load(response)
            answer = result['answer']
            print('\n助手：' + answer)
            for source in result.get('sources', []):
                print('  [' + source['id'] + '] ' + source['title'])
            history += [{'role': 'user', 'content': question},
                        {'role': 'assistant', 'content': answer[:2000]}]
            history = history[-8:]
            while sum(len(m['content']) for m in history) > 6000:
                history = history[2:]
        except urllib.error.HTTPError as error:
            print('服务暂未完成回答（HTTP ' + str(error.code) + '），可稍后重试。')
        except (urllib.error.URLError, TimeoutError, OSError):
            print('连接失败，请确认已运行 main.py，或检查 --api 地址。')
        except (ValueError, KeyError):
            print('接口返回格式异常，请确认连接的是本项目的问答 API。')


if __name__ == '__main__':
    main()
