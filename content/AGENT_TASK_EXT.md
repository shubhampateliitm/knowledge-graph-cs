# Task: add trade-offs and interview sections to existing deep reads

Project root: <repo root>
Read the "Required since v7" section at the end of content/WRITING.md. For each concept in your batch, run
`python3 tools/brief.py <id>` (it prints the current full read) and write an extension block:
    @@+ <id>
    tradeoffs: ... (3–6 paragraphs; for L4/L5 concepts: which model/method/approximation to use and when it breaks down)
    interview: question || answer   (4–6 lines; for L4/L5 concepts, ask how the idea shows up in systems work)
Do not repeat what the read already says; make the decisions concrete (numbers, named alternatives that exist in the
map, what you give up). Append each block to content/drafts/<batch>.txt as soon as it is done and run
`python3 tools/checkread.py content/drafts/<batch>.txt` (format errors must be zero; "!!" length warnings are fine for
extensions). Edit no other file. Be economical with tokens. Reply with one line per concept when done.
