These variable webfont subsets derive from Adobe Source Han Sans CN 2.005R
(思源黑体), licensed under SIL Open Font License 1.1. See OFL.txt.

Official source:
https://github.com/adobe-fonts/source-han-sans/tree/release/Variable/WOFF2/TTF/Subset

Original filename: SourceHanSansCN-VF.ttf.woff2
Git blob SHA-1: 052b1aa5f1479c4aadbf40a6244aaffe5ba4c7c3

Derived internal family name: Qidian Han Sans (Adobe reserves “Source”).
Glyph shapes and the 250–900 weight axis are retained. Hinting and unused
layout features are removed. The interface glyphs load in a small initial
file; additional Unicode blocks load only when text requires them.
No third-party font CDN is required.

To regenerate with Python and fonttools[woff]:

    python3 scripts/subset-source-han.py /path/to/SourceHanSansCN-VF.ttf.woff2 .

This creates app/source-han.css and the source-han-*.woff2 files here.
