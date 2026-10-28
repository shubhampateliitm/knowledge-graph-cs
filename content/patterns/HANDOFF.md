# Handoff: architecture patterns + MIT/Caltech curricula (work in progress)

Request (from Shubham): add common architecture patterns, with a visualization for each, to every tech/tool/concept;
find where visualization can be added; look at Stanford, MIT and Caltech courses and add what adds value to this stack.
Use the `update-down-the-stack` skill. The repo in the cloud session IS the source of truth here: commit and push to the
session's designated branch (no laptop device shell in cloud sessions).

## Done (this commit)

- Visualization audit: all 770 reads already have an ASCII `diagram:`. Animated scenes exist for only 110 concepts
  (L0: 0 of 151, L1: 6 of 94, L2: 64 of 235, L3: 34 of 179). Architecture-pattern flows give every L0-L3 concept
  2-4 animated, auto-laid-out SVG diagrams, which closes that gap.
- `tools/patterns.py`: parser for `content/patterns/*.txt` + automatic left-to-right layered layout (longest path,
  barycentre ordering, neighbour-aligned rows) that compiles each pattern's `flow:` into a scene for web/scene.js;
  scenes are validated with tools/checkanim.py.
- `tools/checkpatterns.py <file> --show`: checker for writers (prints the layout as columns).
- `content/patterns/catalog.txt`: canonical catalog (~110 patterns in 11 families) with sources (Azure Architecture
  Center, Fowler / Joshi Patterns of Distributed Systems, EIP, microservices.io, papers). URLs NOT yet verified
  (the old session had no internet): verify each with curl, fix or blank the wrong ones.
- `content/patterns/README.md` (format spec), `content/patterns/p_gold.txt` (Kafka gold example, 3 patterns),
  `content/AGENT_TASK_PATTERNS.md` (helper-agent brief).
- `tools/build.py`: loads patterns (errors fail the build), table `patterns`, catalog in meta `pcatalog`, pattern
  text indexed in search, `data["patterns"]` / `data["pcatalog"]` embedded in the standalone page.

## To do

1. Server (`server/server.py`): attach `patterns` (full, with scene) to `/api/read/<id>`; add `pcatalog` and pattern
   summaries (concept, title, kinds) to `/api/graph`; tests in tests/test_api.py.
2. App (`web/app.js`, `web/app.css`): in standalone mode attach DATA.patterns to READS like scenes (app.js ~line 40).
   New read section "Architecture patterns" after "Watch it work" (TOC entry): per pattern a card with title, catalog
   chips, when / how / used / avoid, refs, and a DTSScene player (tabs when several, like watchHTML/sceneTab).
   New "Patterns" view/tab (`#patterns`): catalog by family, each entry with summary, source and the concepts that
   implement it (open the read at that pattern). Also show pattern thumbnails (DTSScene.thumb) in the gallery.
   Plain JS, 360 px wide, light and dark, keyboard friendly. Extend tests/e2e.js.
3. Write patterns for all L0-L3 concepts (658 left; kafka done) with helper agents, one batch each (list below),
   brief = content/AGENT_TASK_PATTERNS.md with real paths; drafts outside the repo; check, then copy each into
   content/patterns/<batch>.txt yourself. Merge catalog proposals from <batch>.catalog.txt into catalog.txt.
4. Curricula: add `@school id | name | url` support to tools/kg.py curriculum parsing (programs and courses carry
   `school`, default Stanford; DB columns; app: program buttons grouped by school, "Taught in" lines name the school
   instead of the hard-coded "Stanford" at app.js ~331 and ~709). Then write content/curriculum/mit.txt (6-3 SB
   2022+ curriculum and MEng; ~25 subjects such as 6.1210, 6.1220, 6.1800, 6.1810, 6.1910, 6.1060, 6.1100, 6.5840,
   6.5830, 6.5810, 6.5940, 6.7960, 6.8611, 18.06, codes prefixed "MIT "), caltech.txt (CS BS option; CS 1-4, 21,
   24, 38, 121, 124, 131, 142, 143, 155/156, 179, ...; codes "Caltech CS124") and stanford_more.txt (missing courses
   such as CS 224W, CS 229S, CS 240, CS 244, CS 329S, CS 346, CS 348K, CS 349D, CS 217), verified on official pages.
   Add strong missing concepts these courses teach (with nodes, edges, short + deep reads per the skill).
5. README counts, `python3 tools/build.py`, unit + browser tests (skill section 4), commit, push, publish
   dist/artifact.html to https://claude.ai/artifact/6D3G29ebKpkk87EuKxdAkU (read it first; no icon).

## Batches (L0-L3 concepts without patterns)

- pt01_L0: a2a, feast, hf, jax, langchain, llamacpp, mcp, mlflow, pytorch, sglang, sklearn, tensorflow, vllm, xgboost, alphafold, claude
- pt02_L0: codingagents, cursor, deepseek, gemini, gpt, llama, sd, beam, dask, databricks, duckdb, hdfs, hive, mapreduce, mesos, photon
- pt03_L0: polars, ray, spark, spark-sss, trino, velox, yarn, bitcoin, gfxapi, aurora, bigtable, cassandra, cockroach, dynamodb, fdb, memcached
- pt04_L0: milvus, mongodb, mysql, neo4j, pgvector, pinecone, postgres, redis, rocksdb, scylla, spanner, sqlite, tidb, valkey, tlaplus, amdgpu
- pt05_L0: applem, armisa, cxl, nvgpu, nvme, quantumhw, riscv, tpu, x86, cilium, cloud, cloudflare, docker, envoy, etcd, grafana
- pt06_L0: grpc, haproxy, istio, kubernetes, lambda, linux, nginx, otel, prometheus, s3, terraform, vault, zookeeper, cpp, cuda, fastapi
- pt07_L0: golang, jvm, llvm, python, rust, scala, v8, wasm, acr, codecs, ffmpeg, hlsdash, openrtb, pixels, prebid, vast
- pt08_L0: bigquery, clickhouse, druid, elasticsearch, lucene, opensearch, pinot, redshift, snowflake, airflow, dagster, dbt, temporal, avro, debezium, flink
- pt09_L0: kafka-connect, kafka-streams, kinesis, pulsar, rabbitmq, redpanda, schemareg, sns, sqs, arrow, delta, hms, hudi, iceberg, orc, parquet
- pt10_L0: unity, browser, git, jupyter, react, webrtc, agents, cv, diffusion, dl, llm, llmserving, ml, multimodal, nlp, rag
- pt11_L1: reasoningmodels, recsys, rl, speech, vectorsearch, adtech, attribution, consent, identity, experimentation, olap, rtanalytics, batchproc, mpp, streamproc, graphics
- pt12_L1: datamesh, dimmodel, eventsourcing, lambdakappa, medallion, dataquality, declpipelines, cdc, commitlog, graphdb, newsql, nosql, storageengine, tsdb, blockchain, hci
- pt13_L1: cpucomp, embedded, gpucomp, hpc, searchengine, cloudcomp, containers, coordination, multiregion, orchestration, serverless, virtualization, wsc, featurestore, mlops, contentid
- pt14_L1: mediastream, ssai, mqueue, pubsub, catalog, apigateway, cdn, loadbalancing, servicemesh, vpc, finops, iac, observability, slo, sre, workflow
- pt15_L1: cachelayer, robotics, security, langruntime, durableexec, microservices, multitenancy, cicd, formalverif, vcs, datalake, dfs, lakehouse, objectstore, warehouse, htap
- pt16_L1: oltp, mobilearch, realtime, webarch, auction, cookies, ctrpred, freqcap, idgraph, pacing, contexteng, promptinj, reactloop, toolcall, lsh, pagerank, dagsched, lineage
- pt17_L2: speculative, neuralrender, physsim, raster, raytracing, shading, autoscaling, chaos, erasurecoding, loadshed, merkle, progressive, ratelimit, reconcile, sampling, tracing, backfill, scd
- pt18_L2: adversarial, attention, bpe, contrastive, conv, cot, decoding, distill, embeddings, flows, gans, gnn, gqa, interp, kvcache, layernorm, lora, mlp
- pt19_L2: moe, objdetect, residual, rlhf, rnn, rope, scalinglaws, vae, antientropy, broadcast, cap, circuitbreaker, consensus, conshash, consmodels, crdt, dht, discovery
- pt20_L2: dst, failuredetect, fanout, fencing, gossip, hlc, hotkeys, idempotence, idgen, isr, lamport, lbalgos, leaderelect, ledger, ot, outbox, pacelc, partitioning
- pt21_L2: paxos, pbft, pow, quorum, raft, replication, retries, truetime, twopc, vectorclocks, vr, zab, a11y, allreduce, ann, chunkedprefill, contbatch, denoising
- pt22_L2: flashattn, gemm, mixedprec, mlcompilers, pagedattn, parallelism, promptcache, quant, specdecode, anomaly, autodiff, backprop, boosting, clfmetrics, clustering, crossval, evals, featureeng
- pt23_L2: funnel, gd, genetic, hmm, loss, matfact, ngram, pca, pgm, regression, regularization, svm, varinf, abr, dct, fingerprint, motioncomp, perceptualhash
- pt24_L2: backupdr, batching, concgc, connpool, eventloop, eviction, latencynums, lockfree, profiling, sepstorage, shardpercore, taillatency, threadpool, workstealing, zerocopy, bloom, cms, hll
- pt25_L2: quantilesketch, aqe, codegen, joins, pushdown, queryopt, scattergather, shuffle, vectorized, volcano, bandits, mcts, policygrad, qlearning, kalman, motionplan, pid, bitmap
- pt26_L2: bm25, crawling, docvalues, fst, hybridsearch, invindex, irmetrics, ltr, postings, spatialidx, startree, authn, authz, kms, mtls, oauth, privacytech, supplychain
- pt27_L2: tee, threatmodel, archstyles, qualityattr, ddd, designpatterns, btree, bufferpool, columnar, compaction, cowmor, delvec, encoding, lsm, mvcc, occ, raid, rowlineage
- pt28_L2: schemaevol, secindex, segments, tieredstorage, wal, zonemaps, zorder, backpressure, checkpoint, consumergroups, deliverysem, exactlyonce, logcompaction, sharegroups, statefulops, streamjoin, watermarks, windowing
- pt29_L2: kr, planning, apidesign, renderpipe, virtualdom, amortized, approxalgo, bigo, binpacking, binsearch, compgeom, compressalgo, csp, cuckoo, dp, externalmem, fft, graphsalgo, greedydc, hashtables, heuristicsearch, lca
- pt30_L3: linkedlist, localsearch, maxflow, monostack, mst, onlinealgo, prefixsums, queuesbuf, randalgo, rangeq, roadrouting, sorting, streamalgo, stringmatch, suffixarrays, trees, twopointers, unionfind, workspan, binary, branchpred, cachelines
- pt31_L3: coherence, digitallogic, display, dma, dram, floatingpoint, ftl, hwclocks, interrupts, isa, memhier, memmodel, numa, ooo, pcie, pipeline, powerenergy, roofline, simd, simt, storagedev, tensorcores
- pt32_L3: unicode, usb, vonneumann, colorsci, anycast, arpicmp, bgp, cellular, checksums, congestion, dcnet, dhcp, dns, ethernet, http, httpcaching, iprouting, nat, nfc, ntp, osi, overlaynet
- pt33_L3: quic, rdma, routingalgo, rpc, sockets, ssh, tcp, tls, websocket, wifi, aead, dh, hashfn, hmac, pkcrypto, pqcrypto, prng, pwhash, signatures, symcrypto, zkp, acid
- pt34_L3: ccontrol, indexing, isolation, normalization, recovery, relalgebra, relmodel, sql, dstheory, e2earg, waitfree, allocators, boot, condvars, ctxswitch, deadlock, ebpf, filesystems, fsjournal, fsync, iomodels, ipc
- pt35_L3: locks, mmap, nscgroups, pagecache, pagereplace, permissions, process, rtsched, scheduling, semaphores, signals, syscalls, thread, vmem, callstack, closures, concmodels, coroutines, dataflowan, dispatch, fp, gc
- pt36_L3: hm, hoare, interpreters, irssa, jit, lexing, linking, logicprog, loopopt, oop, ownership, parsealgo, parsing, regalloc, typesys, qalgos, controlhijack, exploitmit, injection, sidechannel, websec, fuzzing
- pt37_L3: swe, automata, computability, modelcheck, pnp, sat, spacecomplex, turingmachine
