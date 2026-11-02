#!/usr/bin/env python3
# 生成 PPT 大纲的 Word 文档。用法：python scripts/make-ppt-outline.py
#
# 产出 D:\\比赛\\PPT大纲-范文放大镜.docx（在仓库外——官方文件名格式要求带学校和
# 队长姓名，而作品内容零个人信息是红线一，所以这个文件不进仓库）。
#
# 内容按官方《作品提交说明》的二、PPT文档内容建议逐节对齐，但按本项目真实情况
# 映射，不编数据：官方框架是数据分析向的（行业权威数据库、用户行为趋势、预测
# 结果），这个项目是教学产品，所以每节都注明对应我们这里的什么，缺数据的地方
# 明说缺，不糊。
#
# 内层引号一律用「」，不用直引号——直引号会把 Python 字符串提前结束。

from pathlib import Path

from docx import Document
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml.ns import qn
from docx.shared import Cm, Pt, RGBColor

OUT = Path(r"D:\比赛\PPT大纲-范文放大镜.docx")
DIAG = Path(__file__).resolve().parent.parent / "docs" / "diagrams"

INK = RGBColor(0x17, 0x38, 0x4D)
ORANGE = RGBColor(0xFF, 0x6B, 0x35)
PINK = RGBColor(0xFF, 0x5D, 0x8F)
SOFT = RGBColor(0x3F, 0x64, 0x78)
GREY = RGBColor(0x6B, 0x7C, 0x85)

FONT = "微软雅黑"


def set_font(run, size=10.5, bold=False, color=INK, name=FONT):
    run.font.name = name
    run.font.size = Pt(size)
    run.font.bold = bold
    run.font.color.rgb = color
    # 中文字体要走 eastAsia，只设 name 对中文不生效
    run._element.rPr.rFonts.set(qn("w:eastAsia"), name)


def para(doc, text="", size=10.5, bold=False, color=INK, space_after=4, align=None):
    p = doc.add_paragraph()
    p.paragraph_format.space_after = Pt(space_after)
    p.paragraph_format.space_before = Pt(0)
    if align:
        p.alignment = align
    if text:
        set_font(p.add_run(text), size, bold, color)
    return p


def rich(doc, parts, size=10.5, space_after=4):
    # parts 是 (文字, 粗体, 颜色) 的列表，用于一段里混排
    p = doc.add_paragraph()
    p.paragraph_format.space_after = Pt(space_after)
    p.paragraph_format.space_before = Pt(0)
    for text, bold, color in parts:
        set_font(p.add_run(text), size, bold, color)
    return p


def page_header(doc, num, title, official):
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(14)
    p.paragraph_format.space_after = Pt(2)
    set_font(p.add_run(f"第 {num} 页　{title}"), 13, True, INK)

    q = doc.add_paragraph()
    q.paragraph_format.space_after = Pt(6)
    run = q.add_run(f"对应官方要求：{official}")
    set_font(run, 9, False, GREY)
    run.font.italic = True


def block(doc, label, lines, color=INK):
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(4)
    p.paragraph_format.space_after = Pt(2)
    set_font(p.add_run(label), 10.5, True, color)
    for line in lines:
        rich(doc, [("· ", False, SOFT), (line, False, INK)], size=10, space_after=2)


def note(doc, text):
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(4)
    p.paragraph_format.space_after = Pt(8)
    run = p.add_run("⚠ " + text)
    set_font(run, 9.5, False, ORANGE)


def figure(doc, name, width_cm, caption):
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p.paragraph_format.space_before = Pt(6)
    p.paragraph_format.space_after = Pt(2)
    p.add_run().add_picture(str(DIAG / f"{name}.png"), width=Cm(width_cm))
    c = doc.add_paragraph()
    c.alignment = WD_ALIGN_PARAGRAPH.CENTER
    c.paragraph_format.space_after = Pt(10)
    set_font(c.add_run(caption), 9, False, GREY)


def h1(doc, text):
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(20)
    p.paragraph_format.space_after = Pt(4)
    set_font(p.add_run(text), 15, True, PINK)


# ================================================================ 文档开始
doc = Document()
for section in doc.sections:
    section.top_margin = Cm(2.0)
    section.bottom_margin = Cm(2.0)
    section.left_margin = Cm(2.2)
    section.right_margin = Cm(2.2)

# ---- 封面 ----
para(doc, "", space_after=30)
para(doc, "范文放大镜", 30, True, INK, align=WD_ALIGN_PARAGRAPH.CENTER)
para(doc, "PPT 大纲", 20, True, ORANGE, space_after=4, align=WD_ALIGN_PARAGRAPH.CENTER)
para(doc, "拆开一篇优秀范文，让孩子看清它是怎么写成的；学一招，写他自己的",
     11, False, SOFT, space_after=24, align=WD_ALIGN_PARAGRAPH.CENTER)

figure(doc, "product-flow", 16.5, "产品三段流程（源文件 docs/diagrams/product-flow.png）")

para(doc, "", space_after=10)
rich(doc, [("文件名格式：", True, INK),
           ("【命题领域-学校-队长姓名-作品名称】——按官方要求照写，"
            "但作品内容里一律不出现学校与姓名（红线一）。", False, INK)], space_after=3)
rich(doc, [("页数：", True, INK),
           ("本文按 20 页设计（封面 + 19 页正文），16:9，单页体积远低于 50MB 上限。",
            False, INK)], space_after=3)
rich(doc, [("用法：", True, INK),
           ("每一页给出「对应官方要求 / 放什么 / 说什么 / 别说什么」，照此直接做 PPT。",
            False, INK)])

doc.add_page_break()

# ---- 映射说明 ----
h1(doc, "先说一件必须坦白的事：官方框架和这个项目不完全对齐")
para(doc,
     "官方《作品提交说明》的二、PPT文档内容建议是数据分析向的：要行业权威数据库、"
     "专业资讯平台、用户行为趋势、预测结果。这个项目是教学产品，不是数据分析项目。"
     "所以每一节都按我们的真实情况映射，缺数据的地方明说缺——不编。",
     space_after=8)

rows = [
    ("官方要的", "我们这里对应什么"),
    ("数据来源（行业权威数据库）",
     "Crossref API（学术元数据检索，逐条验到 DOI）\n"
     "《义务教育语文课程标准（2022 年版）》\n教研材料与一线教师文章"),
    ("知识库内容", "18 张教学设计知识卡，带 stages 字段分 analyze / read 两阶段"),
    ("预处理与利用", "79 篇范文的拆解预处理：同一道闸、逐字校验、可续跑、加载时自愈"),
    ("分析方法选择", "确定性断言评测（不上 model-as-judge）；支架撤除的合取判据"),
    ("用户行为趋势", "埋点已上线（12 个事件的漏斗），但尚未部署，无真实数据。\n"
     "本文用实测的两条路径耗时差距代替，那是真数据"),
    ("预测结果", "换成可验证的结果：79/79 有招、515 处逐字通过、\n"
     "评测 36/36、收藏册单测 59/59、回信单测 34/34"),
    ("风险识别", "外部模型依赖、个人信息红线、示例范文版权"),
]
table = doc.add_table(rows=0, cols=2)
table.style = "Table Grid"
table.alignment = WD_TABLE_ALIGNMENT.CENTER
for i, (a, b) in enumerate(rows):
    cells = table.add_row().cells
    for j, text in enumerate((a, b)):
        cells[j].text = ""
        for k, line in enumerate(text.split("\n")):
            p = cells[j].paragraphs[0] if k == 0 else cells[j].add_paragraph()
            p.paragraph_format.space_after = Pt(1)
            set_font(p.add_run(line), 9.5, i == 0)
for row in table.rows:
    row.cells[0].width = Cm(5.0)
    row.cells[1].width = Cm(11.5)

doc.add_page_break()

# ================================================================ （一）
h1(doc, "（一）作品背景与说明　1 页")

page_header(doc, 1, "封面：它是什么，解决什么问题", "作品背景与说明（1 页）")
block(doc, "放什么", [
    "产品名 + 一句话：拆开一篇优秀范文，让孩子看清它是怎么写成的；学一招，写他自己的",
    "配 product-flow.png（三段流程图）",
    "左下角一行小字：面向小学 3-6 年级",
])
block(doc, "说什么", [
    "孩子写作文卡住，通常不是没话写，是怎么把一件事写出来",
    "背好词好句没用——那是质量标准前置，传的信号是有些词比另一些词更值得被看见",
    "这个产品反过来：拆开一篇好范文，让孩子看清这一句是怎么写成的，然后自己用这一招写一句",
])
note(doc, "别在封面上放学校、姓名、指导教师。红线一。")

page_header(doc, 2, "参考来源：每一个设计决定都有出处", "作品背景与说明 · 参考来源")
block(doc, "放什么", [
    "一张来源清单表，三列：来源 / 用它定了什么 / 怎么核实的",
    "Crossref API 检索 20+ 篇，逐条验证到 DOI",
    "《义务教育语文课程标准（2022 年版）》学段要求",
    "教研材料与一线教师文章（明确标为二手转述，未核对原著）",
])
block(doc, "说什么", [
    "教学法依据：王荣生例文说 + 布鲁纳支架式教学做脊柱",
    "荣维东交际语境写作降级为阶段三读者身份的约束",
    "管建刚作后讲评只是约束不是依据——把他的反对作前指导当拆解依据是分类错误",
    "儿童心理学侧：认知学徒制、支架撤除、兴趣个体化、过度辩护效应",
])
note(doc, "知识库条目全部标 verified:false，引用时必须带未核对原著的限定。"
          "偷偷改成 true 比没有依据更糟。")

# ================================================================ （二）
h1(doc, "（二）数据收集与处理　4 页")

page_header(doc, 3, "数据来源一：Crossref API", "数据来源（1-2 页）")
block(doc, "放什么", [
    "检索记录：api.crossref.org 结构化元数据查询",
    "返回字段：真实标题 / 作者 / 年份 / 期刊 / DOI",
])
block(doc, "说什么", [
    "为什么走 API 不走搜索引擎：本机联网搜索出口被劫持，查询会被换成完全无关的词"
    "（实测查儿童心理学返回游戏 SOMA），结构化元数据至少不会骗人",
    "权威性：Crossref 是 DOI 注册机构，元数据由出版方提供",
    "时效性：按年份过滤，只取近 20 年的实证研究",
    "成果：20+ 篇核心文献逐条验证到 DOI，落在 docs/wiki/07",
])

page_header(doc, 4, "数据来源二：课标与教研材料", "数据来源（1-2 页）")
block(doc, "放什么", [
    "课标 2022 三个学段的写作要求对照表",
    "教研材料出处清单（含未核对原著标注）",
])
block(doc, "说什么", [
    "课标第一学段（1-2 年级）：对写话有兴趣，乐于运用阅读和生活中学到的词语",
    "第二学段（3-4）：尝试运用有新鲜感的词句——这是课标原词",
    "第三学段（5-6）：懂得写作是为了自我表达和与人交流；修改自己的习作",
    "结构性结论：课标没把交际语境放在低段。所以产品只做 3-6 年级",
])

page_header(doc, 5, "知识库：18 张教学设计卡", "知识库内容（1-2 页）")
block(doc, "放什么", [
    "18 张卡的分类：5 张文体视角卡 / 3 位教学法 / 课标卡拆细 / 2 张约束卡",
    "stages 字段取值：analyze（喂给拆解 prompt）/ read（只作参考，不喂）",
])
block(doc, "说什么", [
    "按年级 + 文体两级检索，不按单值过滤——传了文体名就把课标卡和教学法卡全挤掉，"
    "这个 bug 真犯过",
    "文体卡是产品自拟的教学判断，source 里写明产品自拟",
    "约束卡（管建刚、张田若）只在 read 阶段——把他们当可依据的教学法资料喂给 prompt "
    "是分类错误",
])

page_header(doc, 6, "预处理：79 篇怎么变成点开就有招", "预处理与利用（1-2 页）")
block(doc, "放什么", [
    "server-pipeline.png（服务端机制流程图）",
    "latency-paths.png（两条路径实测耗时，对数轴）",
])
block(doc, "说什么", [
    "根因：部署环境没配模型变量，每一篇内置范文都走降级路径，孩子看到的是没能拆出招式",
    "把产品的核心价值押在外部服务上，它会慢、会没配额、会在演示现场不在线",
    "做法：79 篇由同一个 buildAnalysis 提前算好、逐字校验后随库分发",
    "三条硬规矩：存的必须过同一道闸；essayId 是客户端给的、取用时拿原文复核；"
    "返回带 precomputed: true，不冒充当场拆的",
    "两个变体：base（册子空）和 scaffolded（支架撤除生效）。scaffolded 必须带 "
    "challenge，否则不许入库——撤了支架却缺补偿，比不撤更糟。"
    "这条不变式由 precompute-004 锁着，现在 78/79 篇带着 challenge",
    "实测：命中预处理 0.04 秒返回，完全不调模型",
    "技术手段：Crossref API（文献）、precompute-analysis.mjs（预处理）、"
    "StepFun step-3.7-flash（实时链路）、OpenAI 兼容协议",
])
figure(doc, "latency-paths", 14.5, "实测耗时对比（源文件 docs/diagrams/latency-paths.png）")

# ================================================================ （三）
h1(doc, "（三）分析过程　4 页")

page_header(doc, 7, "分析方法：确定性断言，不上 model-as-judge", "分析方法选择（1-2 页）")
block(doc, "放什么", [
    "评测集分类统计：34 条离线（无 Key 可跑）+ 2 条在线",
    "一条用例的真实写法（pass 字段必须是可检查的）",
])
block(doc, "说什么", [
    "选择依据：判分越确定，你越愿意勤跑。model-as-judge 会抖，"
    "抖的判据比没有更糟——它训练人忽略红色",
    "适配优势：教学产品的好坏很多是确定性的（引用是否逐字出自原文、年级是否收窄、"
    "超时预算有没有传下去），这些不需要模型来判",
    "反例：曾把 online-002 的失败记成 temperature=1 偶发失败，真因是稳定超时——"
    "判据错了，结论就错了",
])

page_header(doc, 8, "问题理解与逻辑论证", "问题理解与逻辑论证（2-3 页）")
block(doc, "放什么", [
    "analysis-mindmap.png（分析流程思维导图，六分支）",
    "一张数据表：79/79、515 处、36/36、59/59、34/34、0.04 秒",
])
block(doc, "说什么", [
    "核心问题不是 AI 能不能拆出招，是怎么知道它拆对了、并且一直对",
    "六条证据线：教学法依据（文献）、知识库（教什么）、预处理（数据怎么变能用）、"
    "评测（怎么证明没坏）、行为埋点（孩子实际怎么走）、边界（什么绝不做）",
    "数据实例：515 处引用逐字核对。模型偶尔会把段落改写一遍，孩子看到的就是一篇"
    "被改写却冒充原文的作文——这道闸是机械断言，不是提示词请求",
])
figure(doc, "analysis-mindmap", 16.5, "分析流程思维导图（源文件 docs/diagrams/analysis-mindmap.png）")

page_header(doc, 9, "支架撤除：从单条件到合取", "问题理解与逻辑论证 · 逻辑严密性")
block(doc, "放什么", ["fading-conjunction.png（合取判据）"])
block(doc, "说什么", [
    "最初的判据是单条件：学过的招 ≥ 3 就撤支架",
    "它防不住两种失效：学了很多招从不动笔的孩子，撤了他没地方使力；"
    "只学一招反复写的孩子，撤了他没东西可找",
    "改成合取：学过几招 且 在几篇里用出来过。两个数各自防一种失败",
    "判据收在 fading.js 一处，prompt / 预处理仓 / 实时链路三处共用——"
    "三处各写一份必然分叉",
    "由 fading-001 这条确定性用例锁住三处同口径",
])
note(doc, "这一页是分析严密性最好的例子：它展示的是我们推翻了自己一个已上线的判断，"
          "并且说得出为什么。答辩时这种比报成绩有力。")

page_header(doc, 10, " articulation：一个已存在却被断掉的环节", "创新性伏笔 · 也可放在（四）")
block(doc, "放什么", ["一段前后对比：撤除是单向的 → 撤除有补偿"])
block(doc, "说什么", [
    "服务端早就会给 challenge 字段、也带逐字校验、也确实返回到前端",
    "但前端一行不读。于是支架撤除是单向的：攒够 3 招后服务端少标几招，"
    "孩子只看到东西变少了，让你自己找一句的补偿从未出现",
    "这是认知学徒制六步里断掉的说清楚那一步",
    "修法不是新功能，是把已有的接上：新建 ChallengeCard，spotted 成为册子第三种来源",
])
note(doc, "这个案例值一整页：它证明我们读了自己的代码，而不是只读自己的设计文档。")

# ================================================================ （四）
h1(doc, "（四）创新性与独特视角　2 页")

page_header(doc, 11, "创新点", "创新点展示（1 页）")
block(doc, "创新点一：核心路径摘离外部依赖", [
    "内置范文的拆解提前算好、逐字校验后随库分发，命中即 0.04 秒、不调模型",
    "取用时还要拿请求里的原文复核——essayId 是客户端给的，文本也是，两者没有必然关系",
    "结果：演示现场不可能失败，不配 Key 产品也是完整的",
], color=ORANGE)
block(doc, "创新点二：articulation 接上，撤除从单向变双向", [
    "challenge 字段服务端早就实现，前端一行不读——支架撤除因此是净损失",
    "接上之后，少标的几招由一张卡还回来，孩子自己看出来的招单独算一类",
    "这是修复断裂，不是加功能：能力本来就在，只是没接上",
], color=PINK)
block(doc, "创新点三：回信不是终点，是对话的起点（2026-11-02）", [
    "读者回信到了之后，孩子能接着追问，读者当场答，问答都记在那封信里",
    "信一关上就只能翻，不能再回。用不可逆制造稀缺：回信来了那一刻最想说话，"
    "那一刻过去了就不再补票——否则「回头再聊」等于永远不聊",
    "追问的 prompt 守住了最难过的一关：他问「下一句怎么写」的时候不说答案。"
    "给了句子，他就只是在抄",
    "它撬动的正是写作本身：为了接着问，他得先想清楚自己想问什么",
], color=ORANGE)

page_header(doc, 12, "独特视角：儿童心理学 × 语文教学法 × 工程确定性", "独特视角阐述（1 页）")
block(doc, "放什么", ["一个三环图或三列表：儿童心理学 / 语文教学法 / 工程实现"])
block(doc, "说什么", [
    "儿童心理学给的是孩子为什么会继续写：认知学徒制、支架撤除按表现走、"
    "兴趣个体化、过度辩护效应",
    "语文教学法给的是教什么：例文说给拆解的依据，课标给学段分叉，管建刚给提问红线",
    "工程给的是怎么证明它没坏：逐字校验、确定性评测、白名单埋点",
    "交叉的优势：任何一侧单独都做不成这个产品。只有教学法会做成另一个题库；"
    "只有工程会做成一个能跑但没有教学立场的东西",
])

# ================================================================ （五）
h1(doc, "（五）结果解释与建议　5 页")

page_header(doc, 13, "结果解读", "结果解读（1-2 页）")
block(doc, "放什么", ["一张结果表，每一项都带怎么验证的"])
block(doc, "说什么", [
    "79/79 篇有招、79/79 命中预处理、515 处引用逐字核对通过——穷尽验证，不是抽样",
    "评测 36/36、收藏册单测 59/59、回信单测 34/34、npm run build 通过、密钥自检通过",
    "应用价值：核心路径（选一篇内置范文 → 拆解 → 用一招 → 读者回信 → 追问）"
    "完全不依赖外部服务，演示现场不可能失败",
    "对教学的价值：孩子手里多的是一个能反复用的写法，不是一句别人的话",
])

page_header(doc, 14, "埋点：孩子实际怎么走的", "结果解读 · 用户行为趋势")
block(doc, "放什么", [
    "漏斗设计：enter → start → grade_pick → essay_pick → analyze_done → "
    "move_collect → move_use → spotted → written → reader_done → follow_up",
    "明确标注：尚未部署，暂无真实数据",
])
block(doc, "说什么", [
    "为什么必须做：官方评分框架要用户行为趋势，此前一条数据都没有",
    "三条硬约束：属性白名单（结构上不可能夹带姓名学校）、不存任何原文、"
    "track 永远返回 ok（埋点没资格让孩子的点击失败）",
    "由 track-001 锁住夹带姓名字段零泄漏",
    "follow_up 是这条漏斗上最值钱的一个：读完回信还愿意接着问，"
    "比写完一句更说明孩子被勾住了",
    "诚实交代：埋点已上线但未部署，所以这一页放的是漏斗设计和两条路径的实测耗时，"
    "不是趋势数据",
])
note(doc, "别在这一页画一条好看的上升曲线。没有的数据不画——评委一问就穿。")

page_header(doc, 15, "问题与建议一：粘贴路径仍依赖外部模型", "问题与建议（2-3 页）")
block(doc, "问题", [
    "粘贴一篇自己的范文仍走实时链路，25-60 秒且依赖 Key 有效",
    "这是产品当前最大的风险：内置范文已经不依赖模型了，这一条还没有",
])
block(doc, "建议（按可行性排序）", [
    "短期：把等待态做成产品内容（已有分档文案），并把外部模型依赖作为风险识别写进 PPT",
    "中期：对常见题型做增量预处理，命中即返回；未命中才走实时",
    "别做：为了让粘贴路径也变快而去砍逐字校验。存的时候不严，读的时候就只能慢",
])

page_header(doc, 16, "问题与建议二：三件事只能由人确认", "问题与建议（2-3 页）")
block(doc, "问题", [
    "11-01 记的「≤780px 点用这一招无效」当天已修，而且根因和当时记的方向不同："
    "不是卡片不可点，是点过第一招之后第二张牌整张消失了——.moves-list 被 flex 压成一条，"
    "宽屏 1440px 同样中。已改成右栏整栏滚、列表回自然高度（3 张牌实测 935px），"
    "窄屏再取消置顶牌的 sticky",
    "同一天还修掉：同一招在同一篇里只能收一句（own 的键带上句子）、"
    "两处等待态第三档一句话挂 50 秒、评测里「超时记 SKIP」其实是坏的"
    "（helper 只读 degradeReason，而 reader 回的是 reason，于是读者路径的超时全记成 FAIL）",
])
block(doc, "还剩三件事，都是工具证不出来的", [
    "动效本身：飞牌、回信放大镜的 FLIP 进出场、落贴纸。无头环境里 currentTime 停在 0，"
    "静态截图只能证明元素在、按钮在、关得掉",
    "真机上手指点窄屏：我用截图工具证的是「滚得到、点得到」，不是人手指点得到",
    "ChallengeCard 点下去之后册子里多出第三类：证到卡片会出现、点「我看出来了」"
    "能进挑选页，但那一下之后册子的变化未经人眼确认",
])
block(doc, "建议", [
    "这三条不需要改代码，需要一个人在真实设备上走一遍——每一条都是一句话能定的事",
    "已经确认过的：用户 11-01 确认了回信放大镜的动效和字号；信纸横线与文字基线"
    "的对齐已用 200% 缩放逐行量过",
])
note(doc, "这一页原来的标题是「两处未确认的交互」，其中一处当天就修掉了。"
          "把已修的写进问题页比删掉更诚实——它证明我们读了自己的代码，"
          "而不是只读自己上一周的结论。")

page_header(doc, 17, "风险识别与应对", "风险识别与应对（1-2 页）")
block(doc, "风险一：外部模型依赖", [
    "识别：额度耗尽、端点变更、演示现场不可达",
    "应对：核心路径已摘离（预处理随库分发）；402 不先用量耗尽解释，"
    "先确认端点（/v1 与 /step_plan/v1 是两个分开计费的入口）；"
    "降级话术诚实，不说模型没连上之外的假话",
])
block(doc, "风险二：个人信息红线", [
    "识别：作品内容零个人信息是取消资格线，而界面、代码注释、README、"
    "package.json 的 author、git 提交作者都算作品内容",
    "应对：提交前跑 scripts/check-secrets.sh；扫过 git 全历史 325 个 blob，"
    "无 Key 形态、无姓名/学校/邮箱/手机号；提交作者刻意保持匿名",
])
block(doc, "风险三：示例范文版权", [
    "识别：内置范文全部自撰，不抄教材课文——教材编排本身有版权，"
    "现当代作者多在保护期内，而交付物要公开上传",
    "应对：界面上标示例范文；生成脚本带个人信息红线正则，命中整篇丢弃",
])

# ================================================================ （六）
h1(doc, "（六）应用结果呈现　3 页")

page_header(doc, 18, "应用描述与对话界面", "应用对话界面（1 页）")
block(doc, "放什么", [
    "docs/screenshots/analyzer.png（主界面：左范文、中招式、右下写作坞）",
    "回信放大镜的截图（回信放大到屏幕中央、右上角一个 ×）",
    "追问那一态：信头「他还没走，接着问」+ 你问 / 读者答的对话记录 + 底下的输入框",
    "册子面板截图（头衔 + 文体广度 + 证据墙 + 收进册子的招，每条右边一个 ×）",
])
block(doc, "说什么", [
    "节拍像游戏开局不像表单：开始 → 选年级 → 选范文 → 拆解 → 用一招写自己的",
    "三个阶段在一页里推进，不跳路由——每多一次页面切换就多一个放弃点",
    "读者的身份是读者不是老师：引用原句、说读到什么、最多问一个开放问题，不给建议不列条目",
    "回信到达即放大到屏幕中央读，右上角一个 × 收回，多封能翻回去看",
    "读完还能追问：他问一句、读者当场答一句，问答都记在那封信里。"
    "信一关上就只能翻了，不能再回——回信来了那一刻最想说话，那一刻过去了就不再补票",
    "册子里每一条都能拿出来（× + 6 秒撤销条），点错了、用不上了能弄出去",
])
figure(doc, "product-flow", 15.5, "三段流程（源文件 docs/diagrams/product-flow.png）")

page_header(doc, 19, "提示词示例与输出", "提示词示例与链接呈现（1 页）")
block(doc, "示例一：范文拆解（ANALYZER prompt 真实片段）", [
    "输入：年级 5、题目《爱擦眼镜的爷爷》、类型写人、范文原文",
    "prompt 关键约束：quote 必须逐字照抄原文，一个标点都不能改；"
    "tryThis 只给方法不给句子，不许出填空模板",
    "真实输出：三招——用一个反复出现的小动作串全文 / 把动作拆成小步骤慢慢写 / "
    "加只有你能发现的独家细节",
])
block(doc, "示例二：读者回应（READER prompt 真实片段）", [
    "输入：孩子用第一招写的句子",
    "prompt 关键约束：第一句话必须是你的感觉；挑一处说它为什么打到你；"
    "问一个能让他想接着写的问题；不改他的句子，不告诉他下一句该写什么",
    "真实输出：这里我停下来看了两遍……你写的镜片后面那双眼睛眯成一条缝特别打动人……"
    "爷爷那时候有没有凑到屏幕跟前听过台词呀？",
])
block(doc, "示例三：支架撤除生效时（challenge）", [
    "输入：同一篇范文，但册子已有 ≥3 招且已在 ≥2 篇里用出来过",
    "输出变化：直接标好的招变少，另给一张卡——这一句用了哪一招？上面没标，你自己看",
    "只给原句，不告诉他是哪一招",
])
block(doc, "示例四：追问（FOLLOW_UP prompt 真实片段，2026-11-02 新增）", [
    "输入：他原来写的那句、读者原来的回信、他现在的提问——三段一起喂，"
    "因为要接得上话。每次独立调用，不写会话",
    "prompt 关键约束：绝不替他写句子（他问「下一句怎么写」的时候不说答案，"
    "这是产品的红线——给了句子他就只是在抄）；一律用中文不夹英文单词；两三句话答完",
    "真实输出：我上学的时候也写过这样的同桌……我们俩吓得同时抬头，"
    "才发现老师还在写板书，又低着头偷偷笑了好久。你同桌还有别的趣事吗？",
    "注意最后那一问：读者反问他一个想知道的，对话才接着走下去",
])
note(doc, "链接和账号密码按官方要求附上。密码走 ACCESS_CODE 环境变量，不写进代码。")

page_header(doc, 20, "收尾：我们还没做到的", "总结页（自加，建议保留）")
block(doc, "放什么", ["三条短板，一行一条"])
block(doc, "说什么", [
    "粘贴路径仍依赖外部模型（25-60 秒、依赖 Key）——内置路径已经摘离了，这一条还没有",
    "埋点已上线但未部署，暂无真实行为数据",
    "三件事只能由人确认：动效本身、真机上手指点窄屏、ChallengeCard 点下去之后册子的变化",
])
note(doc, "这一页是主动加的。答辩时自陈短板比被问出来好，而且它和第五节的问题与建议"
          "是同一件事的两种说法——不矛盾。")

para(doc, "", space_after=6)
rich(doc, [("附：本大纲用到的图全部由 ", False, INK), ("scripts/make-diagrams.py", True, INK),
           (" 生成，本文档由 ", False, INK), ("scripts/make-ppt-outline.py", True, INK),
           (" 生成。改内容改脚本重跑，不要手改产物——两处会漂移。", False, INK)],
     size=9.5, space_after=4)
rich(doc, [("图的源文件在 ", False, INK), ("docs/diagrams/", True, INK),
           ("，随仓库分发，换机器不丢。", False, INK)], size=9.5)

OUT.parent.mkdir(parents=True, exist_ok=True)
doc.save(str(OUT))
print("已生成:", OUT)
print("大小: %.1f KB" % (OUT.stat().st_size / 1024))
