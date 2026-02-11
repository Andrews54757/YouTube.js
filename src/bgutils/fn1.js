function fn1(challenge) {
    return (async () => {
        const vm = window[challenge.globalName];
        if (!vm) throw new Error("V not found");
        const vmFunctionsCallback = {
            asyncSnapshotFunction: null,
            shutdownFunction: null,
            passEventFunction: null,
            checkCameraFunction: null
        };

        function timeoutableDeferredPromise(timeout = 10000) {
            let resolve, reject;
            const promise = new Promise((res, rej) => {
                resolve = res;
                reject = rej;
            });

            const timeoutId = setTimeout(() => {
                reject(new Error("timeout"));
            }, timeout);

            return {
                promise, resolve: (n) => {
                    clearTimeout(timeoutId);
                    resolve(n);
                },
                reject
            };
        }

        let { promise, resolve } = timeoutableDeferredPromise(10000);

        if (!vm.a) throw new Error("Init failed");
        try {
            vm.a(challenge.program, (function (n, r, t, f) {
                vmFunctionsCallback.asyncSnapshotFunction = n, vmFunctionsCallback.shutdownFunction = r, vmFunctionsCallback.passEventFunction = t, vmFunctionsCallback.checkCameraFunction = f
                resolve();
            }), true, undefined, ((...n) => { }))
            await promise;
        } catch (n) {
            throw new Error("Failed to load")
        }

        if (!vmFunctionsCallback.asyncSnapshotFunction) throw new Error("fn1 unavailable.");

        let { promise: promise2, resolve: resolve2 } = timeoutableDeferredPromise();

        const psOutput = [];
        vmFunctionsCallback.asyncSnapshotFunction((response) => resolve2(response),
            [
                undefined,
                undefined,
                psOutput,
                undefined
            ]
        );

        const res = await promise2;

        if (!psOutput.length) throw new Error("No output");
        window.ppf = psOutput;

        return res;
    })()
}