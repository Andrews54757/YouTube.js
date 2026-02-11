function fn2(n, r) {
    const t = window.ppf[0];
    if (!t) throw new Error("PP:Undefined");
    return (async () => {
        function e(n, r = !1) {
            const t = btoa(String.fromCharCode(...n));
            return r ? t.replace(/\\+/g, "-").replace(/\\/ / g, "_") : t
        }
        const o = await t(function(n) {
            const r = /[-_.]/g,
                t = {
                    "-": "+",
                    _: "/",
                    ".": "="
                };
            let e;
            return e = r.test(n) ? n.replace(r, (function(n) {
                return t[n]
            })) : n, e = atob(e), new Uint8Array([...e].map((n => n.charCodeAt(0))))
        }(n));
        if ("function" != typeof o) throw new Error("PP:failed");
        const c = [];
        for (const n of r) {
            const r = await o((new TextEncoder).encode(n));
            if (!r) throw new Error("YNJ:Undefined");
            if (!(r instanceof Uint8Array)) throw new Error("ODM:Invalid");
            c.push(e(r, !0))
        }
        return c
    })()
}