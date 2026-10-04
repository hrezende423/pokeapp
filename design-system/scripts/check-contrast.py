#!/usr/bin/env python3
"""WCAG AA gate for tokens.json, light + dark. Exempt by design: border.hairline, text.disabled, text.watermark."""
import json,re,sys,pathlib,fnmatch
t=json.load(open(sys.argv[1] if len(sys.argv)>1 else pathlib.Path(__file__).resolve().parent.parent/"tokens.json"))
def get(p):
    n=t
    for k in p.split("."): n=n[k]
    return n
def res(v):
    m=re.fullmatch(r"\{(.+)\}",v)
    return res(get(m.group(1))["$value"]) if m else v
def lum(h):
    h=h.lstrip("#"); c=[int(h[i:i+2],16)/255 for i in (0,2,4)]
    c=[x/12.92 if x<=.03928 else ((x+.055)/1.055)**2.4 for x in c]
    return .2126*c[0]+.7152*c[1]+.0722*c[2]
def cr(a,b):
    a,b=lum(a),lum(b); a,b=max(a,b),min(a,b); return (a+.05)/(b+.05)
S=t["semantic"]["color"]
def val(path,mode):
    n=S
    for k in path.split("."): n=n[k]
    v=n["$value"] if mode=="light" else n.get("$extensions",{}).get("mode",{}).get("dark",n["$value"])
    return res(v)
P=[]
BG=["bg.canvas","bg.surface","bg.subtle"]
for bg in BG:
    for fg in ["text.default","text.muted","accent.default","accent.strong","status.up","status.down","action.danger"]: P.append((fg,bg,4.5))
    for fg in ["border.strong","border.focus","data.fill"]: P.append((fg,bg,3.0))
for bg in ["bg.canvas","bg.surface"]:
    for k in S["type-text"]: P.append((f"type-text.{k}",bg,4.5))
for a in ["action.primary","action.primary-hover","action.primary-active","action.danger","action.danger-hover"]:
    P.append(("text.on-action",a,4.5)); P.append((a,"bg.surface",3.0))
for a in ["action.secondary","action.secondary-hover"]: P.append(("text.default",a,4.5))
for h in ["success","warning","error","info"]:
    P.append((f"feedback.{h}.fg",f"feedback.{h}.bg",4.5)); P.append((f"feedback.{h}.icon",f"feedback.{h}.bg",3.0))
for k in S["type-on"]:
    P.append((f"type-on.{k}",None,4.5))
fail=0
acc=0
for mode in ["light","dark"]:
    for fg,bg,m in P:
        if bg is None:  # label on type fill (fill is a primitive, same in both modes)
            r=cr(val(fg,mode),res(t["color"]["type"][fg.split(".")[1]]["$value"]))
        else: r=cr(val(fg,mode),val(bg,mode))
        if r<m:
            why=next((v for k,v in t.get("$exceptions",{}).items() if fnmatch.fnmatch(f"{mode}:{fg}",k)),None)
            if why: acc+=1; print(f"ACCEPTED {mode} {fg} on {bg}: {r:.2f} < {m}")
            else: fail+=1; print(f"FAIL {mode} {fg} on {bg}: {r:.2f} < {m}")
print("checks:",len(P)*2,"fails:",fail,"accepted exceptions:",acc)
sys.exit(1 if fail else 0)
