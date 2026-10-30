"""Build the three reviewed deliverables. Never publishes or calls a model."""
import json
from pathlib import Path
import shutil
import zipfile

import package as release

ROOT = Path(__file__).resolve().parents[1]
HUB = ROOT.parent


def copy_public(source, destination):
    count = 0
    for path, relative in release.files_under(source):
        try:
            text = path.read_text(encoding='utf-8')
        except UnicodeDecodeError:
            text = ''
        if release.SECRET.search(text):
            raise RuntimeError('Credential pattern detected; nothing printed: ' + relative.as_posix())
        target = destination / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(path, target)
        count += 1
    return count


def main():
    rag = HUB / '01-RAG独立项目'
    frontend = HUB / '02-个人网站前端'
    archives = HUB / '成品压缩包'
    archives.mkdir(exist_ok=True)
    counts = {'rag': copy_public(ROOT / 'backend', rag),
              'frontend': copy_public(ROOT / 'frontend', frontend)}
    # Local working copies keep usable credentials; public ZIPs always exclude them.
    if (ROOT / 'backend/.env').exists() and not (rag / '.env').exists():
        shutil.copy2(ROOT / 'backend/.env', rag / '.env')
    cmd_python = '@echo off\r\ncd /d "%~dp0"\r\nif exist "D:\\jiqixuexi\\python.exe" (\r\n  "D:\\jiqixuexi\\python.exe" -B {args}\r\n) else (\r\n  python -B {args}\r\n)\r\npause\r\n'
    (rag / '启动接口.cmd').write_bytes(cmd_python.format(args='main.py').encode('utf-8'))
    (rag / '启动问答.cmd').write_bytes(cmd_python.format(args='chat.py').encode('utf-8'))
    (frontend / '打开网站.cmd').write_bytes(cmd_python.format(args='-m http.server 8932 --bind 127.0.0.1').encode('utf-8'))
    results = [release.package(rag, archives / '01-rag-standalone.zip'),
               release.package(frontend, archives / '02-portfolio-frontend.zip'),
               release.package(ROOT, archives / '03-wx-fullstack.zip')]
    for item in results:
        with zipfile.ZipFile(archives / item['file']) as archive:
            assert archive.testzip() is None
            assert not any(Path(n).name == '.env' or '/storage/' in '/' + n for n in archive.namelist())
    (archives / '清单.json').write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding='utf-8')
    (HUB / '项目说明.md').write_text('''# WX 项目成品

| 文件夹 | 用途 | 本机运行 |
| --- | --- | --- |
| 01-RAG独立项目 | 独立 Python RAG、知识库、终端问答与 API | 启动接口.cmd，再运行启动问答.cmd；API 文档 8010/docs |
| 02-个人网站前端 | 独立网站页面、项目、简历和聊天组件 | 打开网站.cmd，访问 127.0.0.1:8932；生成回答需启动 RAG |
| 03-完整全栈项目 | 唯一维护主工程，云端部署此版本 | scripts/preview.cmd；网站 8931、API 8010 |
| 成品压缩包 | 三个对应的公开成品 ZIP | 上传 / 分享使用 ZIP，均不含真实密钥与存储 |
| 历史原稿（仅本机） | 最初原稿及项目核对资料的唯一归档 | 可能含私有配置，不上传 |
| 本机维护 | Git 仓库、运维工具、最新验收记录 | 不作为网站目录，不公开上传 |

正式网站：http://8.152.192.126/wx/
GitHub 完整源码：https://github.com/WuxingAi666/wx-portfolio

01 与 03 的后端使用相同端口，一次只启动一套；独立前端可连接同一后端。
本机目录已保留私有配置便于运行，公开 ZIP 需要自行填写 .env。
后续统一在 03 修改，运行 scripts/build-deliverables.py 重新生成 01、02 与压缩包。
历史中间主题、旧发布说明和无用部署方案不放进这三份成品。
''', encoding='utf-8')
    print(json.dumps({'copies': counts, 'archives': results}, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
