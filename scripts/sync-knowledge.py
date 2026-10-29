"""Sync reviewed public website facts into topic TXT files, without model calls.

Run sync-project-content.py first, then this script; --check detects stale outputs.
Only the final website and project facts are read. Chat transcripts, credentials,
old drafts and company files are deliberately outside this source boundary.
"""
import argparse
import json
import re
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / 'backend/data/public'
VOID = {'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr'}


class Node:
    def __init__(self, tag='', attrs=()):
        self.tag, self.attrs, self.children = tag, dict(attrs), []

    def all(self, tag=None, cls=None, id=None):
        found = []
        for child in self.children:
            if isinstance(child, Node):
                if ((tag is None or child.tag == tag)
                        and (cls is None or cls in child.attrs.get('class', '').split())
                        and (id is None or child.attrs.get('id') == id)):
                    found.append(child)
                found.extend(child.all(tag=tag, cls=cls, id=id))
        return found

    def one(self, **query):
        matches = self.all(**query)
        if not matches:
            raise ValueError('Missing website source: ' + repr(query))
        return matches[0]

    def text(self):
        def raw(node):
            return ''.join(raw(child) if isinstance(child, Node) else child for child in node.children)
        return re.sub(r'\s+', ' ', raw(self)).strip()


class PublicHTML(HTMLParser):
    def __init__(self, html):
        super().__init__(convert_charrefs=True)
        self.root = Node()
        self.stack = [self.root]
        self.feed(html)

    def handle_starttag(self, tag, attrs):
        node = Node(tag, attrs)
        self.stack[-1].children.append(node)
        if tag == 'br':
            node.children.append(' ')
        if tag not in VOID:
            self.stack.append(node)

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
        if tag not in VOID:
            self.handle_endtag(tag)

    def handle_endtag(self, tag):
        for i in range(len(self.stack) - 1, 0, -1):
            if self.stack[i].tag == tag:
                del self.stack[i:]
                return

    def handle_data(self, data):
        self.stack[-1].children.append(data)


def section(title, lines):
    if isinstance(lines, str):
        lines = [lines]
    return '【' + title + '】\n' + '\n'.join(lines)


def render():
    site = PublicHTML((ROOT / 'frontend/index.html').read_text(encoding='utf-8')).root
    projects = json.loads((ROOT / 'frontend/content/projects.json').read_text(encoding='utf-8'))
    about, exp, oa = [site.one(id=x) for x in ('about', 'exp', 'oa')]
    resume = site.one(cls='rsm')
    resume_rows = {n.one(cls='rsm-k').text(): n.one(cls='rsm-v') for n in resume.all(cls='rsm-row')}
    outputs = {}

    profile = [section('仵星的个人定位', [site.one(id='home').one(cls='intro').text(), about.one(cls='sec-sub').text()])]
    for card in about.all(cls='info-card'):
        content = card.all(tag='p') + card.all(tag='li')
        profile.append(section(card.one(tag='h3').text(), [n.text() for n in content]))
    profile += [section('教育时间与主修课程', resume_rows['教育背景'].text()),
                section('职业概述', [n.text() for n in resume_rows['职业概述'].all(tag='li')])]
    profile += [section(n.one(tag='h4').text(), n.one(tag='p').text()) for n in about.all(cls='cap-item')]
    profile += [section('公开简历中的个人信息', [n.text() for n in resume.one(cls='rsm-meta').all(tag='li')]),
                section('公开奖项补充', [n.text() for n in resume_rows['荣誉奖项'].all(tag='li')]),
                section('资料说明', '上述学历、排名、奖项与贡献数字来自本人公开作品集和简历，不代表第三方独立核验，不推导未经提供的成果或个人经历。')]
    outputs['01-profile.txt'] = profile

    internship = [section('实习雇主、岗位与时间', [exp.one(id='experience-title').text(), exp.one(cls='experience-role').text(), exp.one(cls='experience-date').text()]),
                  section('驻场项目与协同关系', exp.one(cls='experience-project').text())]
    internship += [section('仵星的实习贡献：' + n.one(tag='b').text().rstrip('：'), n.text()) for n in exp.one(cls='experience-points').all(tag='li')]
    internship += [section('个人贡献边界', '雇主是致远互联，驻场客户是中国数联，协同团队包括招商局金融科技。本人为实施实习生，独立实施具体业务模块并协同开发排障，不等于独立负责整个客户系统架构或平台底层研发。数字沿用本人公开简历，不推导额外收益；不公开客户内部数据、账号、数据库结构或生产细节。')]
    outputs['02-internship.txt'] = internship

    delivery = [section('业务交付与问题解决', [oa.one(cls='sec-sub').text(), oa.one(cls='delivery-intro').text()])]
    delivery += [section('仵星的交付闭环：' + n.one(tag='h4').text(), n.one(tag='p').text()) for n in oa.one(cls='delivery-journey').all(tag='li')]
    for n in oa.all(cls='delivery-note'):
        delivery.append(section('业务交付职责补充', n.text()))
    delivery += [section('已确认的数据排障案例', '办公用品库初始化时核对管理员编号关系和字段映射，结合 MySQL 查询与运行日志定位问题，协同修正后再验证。该案例只用于介绍排障思路，不公开客户内部表结构、账号或数据。'),
                 section('职责边界', '这是实施实习生对业务模块的参与交付，未宣称独立负责整个客户项目；协同修复不等于每项缺陷都由本人独立编码解决。')]
    outputs['03-oa.txt'] = delivery

    overview = [section('六个项目与当前展示顺序', [f'{i:02}：{p["title"]}。{p["summary"]} 状态：{p["status"]}。' for i, p in enumerate(projects, 1)]),
                section('开发方式与真实边界', '本人使用 AI 工具辅助编码、调试和文档整理，围绕真实需求实践模型/API 集成、前后端交互与迭代交付。BOSS 工具早期独立浏览器自动登录方案出现空白页，根因未查明，最终使用已登录浏览器内的用户脚本；页面定位和平台拦截尚有局限。果蔬经历由本人确认，但源码目前找不到；Coze 仅为简单智能体、基础工作流和知识库 RAG 搭建与了解。详细实现及边界见对应项目资料，不补写未知指标。')]
    outputs['08-other.txt'] = overview

    skills = [section('技能分级说明', '网站四档蓝色表示本人申报的实践程度：熟练、项目应用、基础实践、了解；不是考试分数或统一的工作年限标准。')]
    for card in site.one(id='skills').all(cls='skill-card'):
        category = card.one(tag='h3').text()
        for group in card.all(cls='skill-group'):
            skills.append(section('仵星的' + category + '：' + group.one(cls='skill-level').text(), '、'.join(n.text() for n in group.all(cls='tag'))))
    skills += [section('简历技能与业务场景', [n.text() for n in resume_rows['技能特长'].all(tag='li')])]
    outputs['09-skills.txt'] = skills

    contact = site.one(id='contact')
    outputs['10-contact.txt'] = [
        section('求职方向与到岗时间', [resume.one(cls='rsm-intent').text(), contact.one(cls='tip').text()]),
        section('公开联系方式', [n.text() for n in contact.all(cls='channel')]),
        section('联系入口', '个人网站：https://llywjr.love/wx/ 。GitHub：https://github.com/wuxingai666 。完整简历可通过首屏、实习区和联系区按钮打开，支持打印与保存 PDF。'),
        section('未知事项', '未记录的薪资期望、面试时间和临时到岗安排请联系本人确认。助手不能代约面试、发送消息、承诺录用或提供私人账号和密钥。')]

    campus = site.one(id='campus')
    outputs['14-campus.txt'] = [section('仵星的校园职务', [campus.one(tag='h3').text(), campus.one(cls='org').text()]),
                                section('校园组织协调实践', [n.text() for n in campus.all(tag='li')]),
                                section('文体活动', campus.one(cls='sports-line').text()),
                                section('学业奖项', [n.text() for n in about.one(cls='award-list').all(tag='li')])]
    links = [f'{p["title"]}：' + '；'.join(x['label'] + ' ' + x['url'] for x in p['links']) for p in projects]
    outputs['15-site-guide.txt'] = [
        section('作品集网站如何阅读', '网站为仵星的个人作品集。导航包含关于、项目、实习、业务交付、技能、校园和联系；项目列表保留六个项目，每项可点详情查看介绍、背景、功能、技术链路、难点取舍和配图。图片中的示意图不作为实际运行效果证明。'),
        section('完整简历与打印', '完整简历从首屏、实习区、联系区或助手顶部的查看简历按钮打开，支持滚动阅读、打印或保存为 PDF；不再占主导航独立章节。助手仅保留顶部一个简历入口。简历包含教育、职业概述、实习、六个项目、技能与荣誉。'),
        section('项目源码与在线入口', links),
        section('问答助手的使用', '悬浮入口名为问问仵星的RAG问答助手，窗口标题为仵星的RAG问答助手。电脑支持拖动、缩放、放大还原、最小化；手机适配可视区域。基于公开资料语义检索生成回答，可连续追问、停止、重试、查看来源。新增提问灵感、随机问题、复制回答、导出对话、字号切换、草稿恢复和回到最新回答。对话只保存在当前标签页，导出文件由访客主动下载。'),
        section('部署事实', '网站与 FastAPI 问答后端统一部署到自有 Ubuntu 云服务器，入口为 https://llywjr.love/wx/ 。Nginx 提供 HTTPS 静态网站并反向代理同域问答接口，systemd 管理后端常驻与故障重启，FAISS 索引和 SQLite 配额独立持久化。GitHub 保存完整前后端源码，不通过 GitHub Pages 发布本网站。默认使用外部 BGE-M3 Embedding 和 DeepSeek API，不是全离线推理。')]
    return {name: '\n\n'.join(parts) + '\n' for name, parts in outputs.items()}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    outputs = render()
    manifest_path = DATA / 'manifest.json'
    manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
    for entry in manifest:
        if entry['id'] == 'skills':
            entry['title'] = '技术能力、实践分级与业务场景'
    for entry in [dict(id='campus', file='14-campus.txt', title='校园组织、文体活动与奖项', anchor='campus'),
                  dict(id='site-guide', file='15-site-guide.txt', title='网站、简历、源码与助手使用指南', anchor='contact')]:
        manifest = [n for n in manifest if n['id'] != entry['id']] + [entry]
    # Project synchronizer keeps project entries at the end. Both generators
    # must agree on a stable manifest order to avoid endless dirty checks.
    projects = json.loads((ROOT / 'frontend/content/projects.json').read_text(encoding='utf-8'))
    project_ids = {p['knowledge_id'] for p in projects}
    manifest = [n for n in manifest if n['id'] not in project_ids] + [n for n in manifest if n['id'] in project_ids]
    outputs['manifest.json'] = json.dumps(manifest, ensure_ascii=False, indent=2) + '\n'
    stale = []
    for name, content in outputs.items():
        target = DATA / name
        if not target.exists() or target.read_text(encoding='utf-8') != content:
            stale.append(name)
            if not args.check:
                target.write_text(content, encoding='utf-8')
    print(json.dumps({'mode': 'check' if args.check else 'sync', 'managed_files': len(outputs), 'changed': stale}, ensure_ascii=True))
    if args.check and stale:
        raise SystemExit(1)


if __name__ == '__main__':
    main()
