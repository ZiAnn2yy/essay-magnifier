#!/usr/bin/env python3
"""生成项目的机制图。README 和 PPT 共用，避免两处各画一份然后漂移。

    python scripts/make-diagrams.py

产出 docs/diagrams/*.png 与 *.svg。PNG 给 Word / PPT 用，SVG 给 README 用
（矢量，网页上放大不糊）。

配色取 client/src/styles/app.css 的锁定令牌，不另开色板——图和产品得是一家人。
字体用微软雅黑：幼圆只有 regular 一档，图里要的字号层级（标题重、正文轻）
靠真粗体才拉得开。
"""

from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.patches as mpatches
import matplotlib.pyplot as plt

OUT = Path(__file__).resolve().parent.parent / "docs" / "diagrams"
OUT.mkdir(parents=True, exist_ok=True)

INK = "#17384d"
SKY = "#bfe9ff"
ORANGE = "#ff6b35"
YELLOW = "#ffd23f"
PINK = "#ff5d8f"
PURPLE = "#a06cd5"
WHITE = "#ffffff"
SOFT = "#3f6478"

plt.rcParams["font.family"] = ["Microsoft YaHei", "YouYuan", "SimHei"]
plt.rcParams["axes.unicode_minus"] = False


def box(ax, x, y, w, h, text, face, edge=INK, size=11, weight="bold", tcolor=INK, lw=2.2):
    patch = mpatches.FancyBboxPatch(
        (x, y), w, h,
        boxstyle="round,pad=0,rounding_size=0.03",
        facecolor=face, edgecolor=edge, linewidth=lw, mutation_aspect=1,
    )
    ax.add_patch(patch)
    ax.text(x + w / 2, y + h / 2, text, ha="center", va="center",
            fontsize=size, color=tcolor, fontweight=weight, linespacing=1.6)


def arrow(ax, x1, y1, x2, y2, color=INK, lw=2.0, ls="-"):
    ax.annotate("", xy=(x2, y2), xytext=(x1, y1),
                arrowprops=dict(arrowstyle="-|>", color=color, lw=lw,
                                linestyle=ls, shrinkA=0, shrinkB=0))


def save(fig, name):
    for ext in ("png", "svg"):
        fig.savefig(OUT / f"{name}.{ext}", dpi=200, bbox_inches="tight",
                    facecolor="white", pad_inches=0.2)
    plt.close(fig)
    print(f"  {name}.png / .svg")


# ---------------------------------------------------------------- 图一：产品三段流程
def product_flow():
    fig, ax = plt.subplots(figsize=(13, 5.6))
    ax.set_xlim(0, 13)
    ax.set_ylim(0, 5.6)
    ax.axis("off")

    ax.text(6.5, 5.25, "三个阶段在一页里推进，不跳路由", ha="center",
            fontsize=14, color=INK, fontweight="bold")

    stages = [
        (0.25, "开始", SKY),
        (2.15, "选年级", SKY),
        (4.05, "选范文", YELLOW),
        (5.95, "拆解", ORANGE),
        (7.85, "用一招写自己的", PINK),
        (9.75, "读者回信", PURPLE),
    ]
    w, h, y = 1.7, 0.9, 3.95
    for x, label, color in stages:
        box(ax, x, y, w, h, label, color, size=12.5)
        if x < 9.75:
            arrow(ax, x + w + 0.03, y + h / 2, x + w + 0.35, y + h / 2)

    # 说明框：只给三条关键路径，宽度放到 3.4，字号 9.5，留足余量
    notes = [
        (4.05, YELLOW, "内置 79 篇\n命中预处理\n0.04 秒返回，不调模型\n\n贴一篇自己的\n实时链路 25-60 秒，依赖 Key"),
        (5.95, ORANGE, "招式卡四样\n招式名 / 范文原句\n这一句里发生了什么\n你可以怎么用\n\n外加 challenge 与依据"),
        (9.75, PURPLE, "先表态\n挑一处说感受\n问一个开放问题\n\n放大到屏幕中央读\n右上角一个 × 收回"),
    ]
    for x, color, text in notes:
        box(ax, x, 0.4, 3.4, 2.75, text, WHITE, edge=color, size=10, weight="normal", lw=2.2)
        arrow(ax, x + 1.7, y - 0.03, x + 1.7, 3.22, color=color, lw=1.8, ls="--")

    # 招式收藏册是这三条的汇聚处，单独一块放在最左
    box(ax, 0.25, 0.4, 3.3, 2.75,
        "招式收藏册\n\n学来的招\n用上的句\n自己看出来的招\n\n头衔按\n「用自己的话接过的篇数」",
        SKY, size=10, weight="normal", lw=2.2)
    arrow(ax, 7.85 + 0.85, y - 0.03, 1.9, 3.22, color=INK, lw=1.6, ls=":")

    save(fig, "product-flow")


# ---------------------------------------------------------------- 图二：服务端机制
def server_pipeline():
    fig, ax = plt.subplots(figsize=(12.5, 6.8))
    ax.set_xlim(0, 12.5)
    ax.set_ylim(0, 6.8)
    ax.axis("off")

    box(ax, 4.3, 6.0, 3.9, 0.62, "POST /api/v3/analyze", SKY, size=13)
    arrow(ax, 6.25, 5.96, 6.25, 5.55)

    box(ax, 4.0, 4.85, 4.5, 0.66, "是内置范文吗？（带 essayId）", WHITE, size=12)

    # 左支：预处理
    arrow(ax, 4.5, 4.81, 2.6, 4.3, color=ORANGE)
    ax.text(2.85, 4.6, "是", fontsize=12, color=ORANGE, fontweight="bold")
    box(ax, 0.5, 3.35, 4.2, 0.92,
        "预处理仓\n提前算好 + 逐字核对后随库分发", ORANGE, size=11)
    arrow(ax, 2.6, 3.31, 2.6, 2.95, color=ORANGE)
    box(ax, 0.5, 2.05, 4.2, 0.86,
        "拿请求里的原文再复核一遍\n对不上 → 退回实时链路", WHITE, edge=ORANGE,
        size=10.5, weight="normal", lw=2.2)

    # 右支：实时
    arrow(ax, 8.0, 4.81, 9.9, 4.3, color=PINK)
    ax.text(9.05, 4.6, "否", fontsize=12, color=PINK, fontweight="bold")
    box(ax, 7.8, 3.35, 4.4, 0.92,
        "实时链路\n知识库检索（年级 + 文体）\n→ StepFun step-3.7-flash", PINK, size=10.5)
    arrow(ax, 10.0, 3.31, 10.0, 2.95, color=PINK)
    box(ax, 7.8, 2.05, 4.4, 0.86,
        "isValidAnalysis 逐字校验\n不通过 → 自纠错一轮 → 仍不过则降级", WHITE, edge=PINK,
        size=10.5, weight="normal", lw=2.2)

    # 汇合
    arrow(ax, 2.6, 2.01, 5.1, 1.5, color=INK)
    arrow(ax, 10.0, 2.01, 7.6, 1.5, color=INK)
    box(ax, 3.5, 0.62, 5.5, 0.82,
        "支架撤除判据（fading.js，只有这一处）", YELLOW, size=12.5)
    ax.text(6.25, 0.22, "学过几招 ≥ 3    且    在几篇里用出来过 ≥ 2",
            ha="center", fontsize=11, color=SOFT, fontweight="bold")

    save(fig, "server-pipeline")


# ---------------------------------------------------------------- 图三：合取判据
def fading_conjunction():
    fig, ax = plt.subplots(figsize=(10.5, 4.0))
    ax.set_xlim(0, 10.5)
    ax.set_ylim(0, 4.0)
    ax.axis("off")

    box(ax, 0.4, 1.5, 3.9, 1.25,
        "学过的招 ≥ 3\ncountLearnedMoves\n只数 from=essay", ORANGE, size=11.5)
    box(ax, 6.2, 1.5, 3.9, 1.25,
        "用出来过的篇目 ≥ 2\ncountOwnEssays\n按 essayId 去重", PINK, size=11.5)
    box(ax, 4.4, 1.9, 1.7, 0.45, "且", YELLOW, size=17)

    arrow(ax, 4.35, 2.15, 5.2, 3.0, color=INK, lw=1.8)
    arrow(ax, 6.15, 2.15, 5.3, 3.0, color=INK, lw=1.8)

    box(ax, 3.3, 3.1, 3.9, 0.66, "撤支架 → 给 challenge", PURPLE, size=13)

    ax.text(5.25, 0.86, "单条件会失效：只数学过的招，学了很多从不动笔的孩子会被过早撤除；",
            ha="center", fontsize=10, color=SOFT)
    ax.text(5.25, 0.46, "只数用出来过，只学一招反复写的孩子撤了也没东西可找。",
            ha="center", fontsize=10, color=SOFT)

    save(fig, "fading-conjunction")


if __name__ == "__main__":
    print("生成机制图 →", OUT)
    product_flow()
    server_pipeline()
    fading_conjunction()
    print("完成")
