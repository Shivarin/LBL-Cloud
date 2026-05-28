/**
 * LBL Cloud — загрузка с прогрессом в реальном времени (XHR).
 */
(function (global) {
    "use strict";

    const PARALLEL_FILES = 3;
    const DEFAULT_CHUNK_CONCURRENCY = 4;
    /** До этого размера — один POST (мгновенный старт). Больше — части (без долгой «подготовки» в браузере). */
    const DEFAULT_SIMPLE_MAX_MB = 64;
    const MIN_CHUNK_BYTES = 8 * 1024 * 1024;
    const MAX_CHUNK_BYTES = 32 * 1024 * 1024;
    const PROGRESS_THROTTLE_MS = 50;

    function getSimpleUploadMaxBytes(opts) {
        if (opts.simpleUploadMaxMb != null) {
            return opts.simpleUploadMaxMb * 1024 * 1024;
        }
        if (opts.chunkThresholdMb != null) {
            return opts.chunkThresholdMb * 1024 * 1024;
        }
        return DEFAULT_SIMPLE_MAX_MB * 1024 * 1024;
    }

    function pickChunkBytes(fileSize, serverChunkBytes, concurrency) {
        const c = concurrency || DEFAULT_CHUNK_CONCURRENCY;
        const targetParts = Math.max(c * 3, 6);
        const byParts = Math.ceil(fileSize / targetParts);
        const base = serverChunkBytes || 16 * 1024 * 1024;
        return Math.max(MIN_CHUNK_BYTES, Math.min(MAX_CHUNK_BYTES, Math.max(base, byParts)));
    }

    function authHeaders(json) {
        const token = localStorage.getItem("authToken") || localStorage.getItem("token");
        const h = {};
        if (token) h.Authorization = "Bearer " + token;
        if (json) h["Content-Type"] = "application/json";
        try {
            const cm = document.cookie.match(/(?:^|; )lbl_csrf=([^;]*)/);
            if (cm) h["X-CSRF-Token"] = decodeURIComponent(cm[1]);
        } catch (e) {
            /* noop */
        }
        return h;
    }

    function notify(onProgress, payload) {
        if (!onProgress) return;
        onProgress(payload);
    }

    function uploadSimple(file, folderId, onProgress) {
        return new Promise(function (resolve, reject) {
            notify(onProgress, {
                phase: "init",
                mode: "simple",
                pct: 0,
                loaded: 0,
                total: file.size,
            });

            const fd = new FormData();
            fd.append("file", file);
            if (folderId != null) fd.append("folder_id", String(folderId));

            const xhr = new XMLHttpRequest();
            xhr.open("POST", "/api/drive/upload");
            const headers = authHeaders(false);
            Object.keys(headers).forEach(function (k) {
                xhr.setRequestHeader(k, headers[k]);
            });
            xhr.withCredentials = true;
            xhr.timeout = 0;

            xhr.upload.onloadstart = function () {
                notify(onProgress, { phase: "upload", pct: 0, loaded: 0, total: file.size });
            };

            xhr.upload.onprogress = function (e) {
                if (!e.lengthComputable) return;
                notify(onProgress, {
                    phase: "upload",
                    pct: Math.min(99, Math.round((e.loaded / e.total) * 100)),
                    loaded: e.loaded,
                    total: e.total,
                });
            };

            xhr.onload = function () {
                if (xhr.status >= 200 && xhr.status < 300) {
                    try {
                        notify(onProgress, {
                            phase: "done",
                            pct: 100,
                            loaded: file.size,
                            total: file.size,
                        });
                        resolve(JSON.parse(xhr.responseText));
                    } catch (err) {
                        reject(err);
                    }
                } else {
                    let msg = "Ошибка загрузки";
                    try {
                        const j = JSON.parse(xhr.responseText);
                        msg = j.detail || msg;
                    } catch (e2) {
                        /* noop */
                    }
                    reject(new Error(typeof msg === "string" ? msg : JSON.stringify(msg)));
                }
            };
            xhr.onerror = function () {
                reject(new Error("Сеть недоступна"));
            };
            xhr.send(fd);
        });
    }

    function postChunkXhr(uploadId, offset, slice, onPartProgress) {
        return new Promise(function (resolve, reject) {
            const fd = new FormData();
            fd.append("upload_id", uploadId);
            fd.append("offset", String(offset));
            fd.append("chunk", slice, "chunk.bin");

            const xhr = new XMLHttpRequest();
            xhr.open("POST", "/api/drive/upload/chunk");
            const headers = authHeaders(false);
            Object.keys(headers).forEach(function (k) {
                xhr.setRequestHeader(k, headers[k]);
            });
            xhr.withCredentials = true;
            xhr.timeout = 0;

            xhr.upload.onprogress = function (e) {
                if (e.lengthComputable && onPartProgress) {
                    onPartProgress(offset, e.loaded, slice.size);
                }
            };

            xhr.onload = function () {
                if (xhr.status >= 200 && xhr.status < 300) {
                    try {
                        resolve(JSON.parse(xhr.responseText));
                    } catch (err) {
                        reject(err);
                    }
                } else {
                    let msg = "Ошибка части";
                    try {
                        const j = JSON.parse(xhr.responseText);
                        msg = j.detail || msg;
                    } catch (e2) {
                        /* noop */
                    }
                    reject(new Error(typeof msg === "string" ? msg : JSON.stringify(msg)));
                }
            };
            xhr.onerror = function () {
                reject(new Error("Сеть недоступна"));
            };
            xhr.send(fd);
        });
    }

    function uploadChunkedParallel(file, folderId, opts) {
        const onProgress = opts.onProgress;
        const concurrency = Math.max(1, opts.chunkConcurrency || DEFAULT_CHUNK_CONCURRENCY);

        notify(onProgress, {
            phase: "init",
            mode: "chunks",
            pct: 0,
            loaded: 0,
            total: file.size,
        });

        return fetch("/api/drive/upload/init", {
            method: "POST",
            headers: authHeaders(true),
            credentials: "include",
            body: JSON.stringify({
                filename: file.name,
                size_bytes: file.size,
                folder_id: folderId,
                content_type: file.type || "application/octet-stream",
            }),
        })
            .then(function (r) {
                if (!r.ok) return r.json().then(function (j) { throw new Error(j.detail || "init failed"); });
                return r.json();
            })
            .then(function (init) {
                const uploadId = init.upload_id;
                const serverChunk =
                    opts.chunkSizeMb != null
                        ? opts.chunkSizeMb * 1024 * 1024
                        : init.chunk_size || null;
                const chunkBytes = pickChunkBytes(file.size, serverChunk, concurrency);
                const parts = [];
                for (let off = 0; off < file.size; off += chunkBytes) {
                    parts.push({
                        offset: off,
                        slice: file.slice(off, Math.min(off + chunkBytes, file.size)),
                    });
                }

                let completedBytes = 0;
                const inFlightLoaded = {};
                let idx = 0;
                let inFlight = 0;
                let failed = null;
                let lastNotify = 0;

                function totalLoadedNow() {
                    let sum = completedBytes;
                    Object.keys(inFlightLoaded).forEach(function (k) {
                        sum += inFlightLoaded[k] || 0;
                    });
                    return Math.min(file.size, sum);
                }

                function report(force) {
                    const now = Date.now();
                    if (!force && now - lastNotify < PROGRESS_THROTTLE_MS) return;
                    lastNotify = now;
                    const loaded = totalLoadedNow();
                    notify(onProgress, {
                        phase: loaded > 0 ? "upload" : "init",
                        pct: file.size ? Math.min(99, Math.round((loaded / file.size) * 100)) : 0,
                        loaded: loaded,
                        total: file.size,
                    });
                }

                notify(onProgress, { phase: "upload", pct: 0, loaded: 0, total: file.size });

                return new Promise(function (resolve, reject) {
                    function pump() {
                        if (failed) return;
                        while (inFlight < concurrency && idx < parts.length) {
                            const part = parts[idx++];
                            const partKey = String(part.offset);
                            inFlightLoaded[partKey] = 0;
                            inFlight++;

                            postChunkXhr(uploadId, part.offset, part.slice, function (offset, loadedInPart) {
                                inFlightLoaded[String(offset)] = loadedInPart;
                                report(false);
                            })
                                .then(function () {
                                    completedBytes += part.slice.size;
                                    delete inFlightLoaded[partKey];
                                    report(true);
                                })
                                .catch(function (err) {
                                    failed = err;
                                    reject(err);
                                })
                                .finally(function () {
                                    inFlight--;
                                    if (failed) return;
                                    if (idx >= parts.length && inFlight === 0) {
                                        const fd = new FormData();
                                        fd.append("upload_id", uploadId);
                                        fetch("/api/drive/upload/complete", {
                                            method: "POST",
                                            headers: authHeaders(false),
                                            credentials: "include",
                                            body: fd,
                                        })
                                            .then(function (r) {
                                                if (!r.ok) {
                                                    return r.json().then(function (j) {
                                                        throw new Error(j.detail || "complete failed");
                                                    });
                                                }
                                                return r.json();
                                            })
                                            .then(function (res) {
                                                notify(onProgress, {
                                                    phase: "done",
                                                    pct: 100,
                                                    loaded: file.size,
                                                    total: file.size,
                                                });
                                                resolve(res);
                                            })
                                            .catch(reject);
                                    } else {
                                        pump();
                                    }
                                });
                        }
                    }
                    if (!parts.length) {
                        reject(new Error("Пустой файл"));
                        return;
                    }
                    pump();
                });
            });
    }

    function uploadFile(file, opts) {
        opts = opts || {};
        const folderId = opts.folderId != null ? opts.folderId : null;
        const onProgress = opts.onProgress;
        const simpleMax = getSimpleUploadMaxBytes(opts);

        if (file.size > simpleMax) {
            return uploadChunkedParallel(file, folderId, opts);
        }
        return uploadSimple(file, folderId, onProgress);
    }

    function uploadMany(files, opts) {
        opts = opts || {};
        const queue = Array.from(files);
        const results = [];
        const errors = [];
        const maxFiles = opts.parallelFiles != null ? opts.parallelFiles : PARALLEL_FILES;
        let active = 0;
        let idx = 0;

        return new Promise(function (resolve) {
            function pump() {
                while (active < maxFiles && idx < queue.length) {
                    const file = queue[idx++];
                    const jobId = opts.onJobStart && opts.onJobStart(file);
                    active++;
                    uploadFile(file, {
                        folderId: opts.folderId,
                        simpleUploadMaxMb: opts.simpleUploadMaxMb,
                        chunkSizeMb: opts.chunkSizeMb,
                        chunkConcurrency: opts.chunkConcurrency,
                        chunkMb: opts.chunkMb,
                        onProgress: function (progress) {
                            if (opts.onJobProgress) opts.onJobProgress(jobId, progress);
                        },
                    })
                        .then(function (res) {
                            results.push(res);
                            if (opts.onJobDone) opts.onJobDone(jobId, null);
                        })
                        .catch(function (err) {
                            errors.push({ file: file.name, error: err.message || String(err) });
                            if (opts.onJobDone) opts.onJobDone(jobId, err);
                        })
                        .finally(function () {
                            active--;
                            if (idx >= queue.length && active === 0) {
                                resolve({ results: results, errors: errors });
                            } else {
                                pump();
                            }
                        });
                }
            }
            if (!queue.length) resolve({ results: [], errors: [] });
            else pump();
        });
    }

    global.LblDriveUpload = {
        uploadFile: function (file, opts) {
            return uploadFile(file, opts || {});
        },
        uploadMany: uploadMany,
        PARALLEL: PARALLEL_FILES,
    };
})(window);
