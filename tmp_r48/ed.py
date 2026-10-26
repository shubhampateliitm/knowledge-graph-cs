import sys,json,re
p=sys.argv[1]; ops=json.load(sys.stdin)
L=open(p,encoding='utf-8').read().split('\n')
KEYS="value terms history how diagram example intuition mistakes friction tradeoffs practice interview quiz ref".split()
for pre,new in ops:
    idx=[i for i,l in enumerate(L) if l.startswith(pre) or any(l.startswith(k+': '+pre) for k in KEYS)]
    assert len(idx)==1,(pre,len(idx))
    i=idx[0]; m=re.match(r'^(\w+): ',L[i]); key=(m.group(0) if m and m.group(1) in KEYS else '')
    if new is None:
        assert not key,(pre,'cannot delete keyed line'); del L[i]
    else: L[i]=key+new
open(p,'w',encoding='utf-8').write('\n'.join(L))
