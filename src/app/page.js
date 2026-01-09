"use client";

import { useEffect, useMemo, useState } from "react";

const STORAGE_KEY = "sosi-rens:v0";

function sortEntriesDesc(obj) {
  return Object.entries(obj || {}).sort((a, b) => (b[1] || 0) - (a[1] || 0) || String(a[0]).localeCompare(String(b[0])));
}

function uniq(list) {
  return [...new Set((list || []).filter(Boolean))];
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function readJsonFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Kunne ikke lese fil."));
    reader.onload = () => {
      try {
        resolve(JSON.parse(String(reader.result || "{}")));
      } catch {
        reject(new Error("Ugyldig JSON-fil."));
      }
    };
    reader.readAsText(file);
  });
}

export default function Home() {
  const [step, setStep] = useState("upload"); // upload | explore | filter | download
  const [activeTab, setActiveTab] = useState("punkter"); // punkter | ledninger

  const [file, setFile] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [encodingInfo, setEncodingInfo] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const [selection, setSelection] = useState({
    objTypesByCategory: { punkter: [], ledninger: [] },
    fieldsByCategory: { punkter: [], ledninger: [] },
    lastFileName: null,
  });

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      setSelection((prev) => ({ ...prev, ...parsed }));
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(selection));
    } catch {
      // ignore
    }
  }, [selection]);

  const exploreData = useMemo(() => {
    if (!analysis?.analysis) return null;
    const byCategory = analysis.analysis.byCategory || {};

    return {
      punkter: {
        features: byCategory.punkter?.features || 0,
        objTypes: sortEntriesDesc(byCategory.punkter?.objTypes || {}),
        fields: sortEntriesDesc(byCategory.punkter?.fields || {}),
        tema: sortEntriesDesc(byCategory.punkter?.pTema || {}),
      },
      ledninger: {
        features: byCategory.ledninger?.features || 0,
        objTypes: sortEntriesDesc(byCategory.ledninger?.objTypes || {}),
        fields: sortEntriesDesc(byCategory.ledninger?.fields || {}),
        tema: sortEntriesDesc(byCategory.ledninger?.lTema || {}),
      },
    };
  }, [analysis]);

  const available = useMemo(() => {
    if (!exploreData) return null;
    return {
      punkter: {
        objTypes: exploreData.punkter.objTypes.map(([k]) => k),
        fields: exploreData.punkter.fields.map(([k]) => k),
      },
      ledninger: {
        objTypes: exploreData.ledninger.objTypes.map(([k]) => k),
        fields: exploreData.ledninger.fields.map(([k]) => k),
      },
    };
  }, [exploreData]);

  async function runAnalyze(selectedFile) {
    setError(null);
    setBusy(true);
    try {
      const fd = new FormData();
      fd.set("file", selectedFile);
      const res = await fetch("/api/analyze", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Analyse feilet.");

      setAnalysis(json);
      setEncodingInfo(json.encoding || null);

      // Initialize defaults: keep all discovered objTypes/fields if user has nothing stored yet.
      setSelection((prev) => {
        const next = { ...prev, lastFileName: selectedFile.name || null };
        if (available) return next;
        return next;
      });

      setStep("explore");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  function ensureDefaultsFromAnalysis() {
    if (!available) return;
    setSelection((prev) => {
      const next = { ...prev };
      next.objTypesByCategory = {
        punkter: prev.objTypesByCategory?.punkter?.length ? prev.objTypesByCategory.punkter : available.punkter.objTypes,
        ledninger: prev.objTypesByCategory?.ledninger?.length ? prev.objTypesByCategory.ledninger : available.ledninger.objTypes,
      };
      next.fieldsByCategory = {
        punkter: prev.fieldsByCategory?.punkter?.length ? prev.fieldsByCategory.punkter : available.punkter.fields,
        ledninger: prev.fieldsByCategory?.ledninger?.length ? prev.fieldsByCategory.ledninger : available.ledninger.fields,
      };
      return next;
    });
  }

  useEffect(() => {
    // When analysis arrives, bootstrap selection if empty.
    if (!available) return;
    ensureDefaultsFromAnalysis();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [available?.punkter?.objTypes?.length, available?.ledninger?.objTypes?.length]);

  function toggleInList(list, value) {
    const set = new Set(list || []);
    if (set.has(value)) set.delete(value);
    else set.add(value);
    return [...set];
  }

  function setAll(category, kind, values) {
    setSelection((prev) => {
      const next = { ...prev };
      next[`${kind}ByCategory`] = { ...prev[`${kind}ByCategory`], [category]: [...values] };
      return next;
    });
  }

  async function downloadCleaned() {
    if (!file) return;
    setError(null);
    setBusy(true);
    try {
      const fd = new FormData();
      fd.set("file", file);
      fd.set("selection", JSON.stringify({
        objTypesByCategory: selection.objTypesByCategory,
        fieldsByCategory: selection.fieldsByCategory,
      }));

      const res = await fetch("/api/clean", { method: "POST", body: fd });
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        throw new Error(json?.error || "Rensing feilet.");
      }
      const blob = await res.blob();
      const header = res.headers.get("Content-Disposition") || "";
      const match = header.match(/filename="([^"]+)"/);
      const name = match?.[1] || "renset.sos";
      downloadBlob(blob, name);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  function exportSettings() {
    const payload = {
      objTypesByCategory: selection.objTypesByCategory,
      fieldsByCategory: selection.fieldsByCategory,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    downloadBlob(blob, "sosi-rens-utvalg.json");
  }

  async function importSettingsFromFile(fileObj) {
    setError(null);
    try {
      const imported = await readJsonFile(fileObj);
      setSelection((prev) => ({
        ...prev,
        objTypesByCategory: imported.objTypesByCategory || prev.objTypesByCategory,
        fieldsByCategory: imported.fieldsByCategory || prev.fieldsByCategory,
      }));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  function clearSavedSettings() {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
    setSelection({
      objTypesByCategory: { punkter: [], ledninger: [] },
      fieldsByCategory: { punkter: [], ledninger: [] },
      lastFileName: null,
    });
    if (available) ensureDefaultsFromAnalysis();
  }

  const tabData = exploreData ? exploreData[activeTab] : null;
  const selectedObjTypes = selection.objTypesByCategory?.[activeTab] || [];
  const selectedFields = selection.fieldsByCategory?.[activeTab] || [];

  const mandatoryFields = useMemo(() => new Set(["OBJTYPE", "EGS_PUNKT", "EGS_LEDNING"]), []);

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-950">
      <main className="mx-auto w-full max-w-6xl px-6 py-10">
        <header className="mb-8">
          <h1 className="text-3xl font-semibold tracking-tight">SOSI-Rens</h1>
          <p className="mt-2 text-zinc-600">
            Last opp SOSI → utforsk innhold → velg utvalg → last ned renset fil.
          </p>
        </header>

        {error ? (
          <div className="mb-6 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-red-800">
            {error}
          </div>
        ) : null}

        {encodingInfo?.fallbackUsed ? (
          <div className="mb-6 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-amber-900">
            Filen ble tolket med tegnsett "{encodingInfo.used}".
          </div>
        ) : null}

        <div className="mb-6 flex flex-wrap items-center gap-2">
          <button
            className={`rounded-md px-3 py-2 text-sm font-medium ${step === "upload" ? "bg-zinc-900 text-white" : "bg-white border border-zinc-200"}`}
            onClick={() => setStep("upload")}
            type="button"
          >
            1. Last opp
          </button>
          <button
            className={`rounded-md px-3 py-2 text-sm font-medium ${step === "explore" ? "bg-zinc-900 text-white" : "bg-white border border-zinc-200"}`}
            onClick={() => analysis && setStep("explore")}
            type="button"
            disabled={!analysis}
          >
            2. Utforsk data
          </button>
          <button
            className={`rounded-md px-3 py-2 text-sm font-medium ${step === "filter" ? "bg-zinc-900 text-white" : "bg-white border border-zinc-200"}`}
            onClick={() => analysis && setStep("filter")}
            type="button"
            disabled={!analysis}
          >
            3. Filtrer
          </button>
          <button
            className={`rounded-md px-3 py-2 text-sm font-medium ${step === "download" ? "bg-zinc-900 text-white" : "bg-white border border-zinc-200"}`}
            onClick={() => analysis && setStep("download")}
            type="button"
            disabled={!analysis}
          >
            4. Last ned
          </button>
        </div>

        {step === "upload" ? (
          <section className="rounded-lg border border-zinc-200 bg-white p-6">
            <h2 className="text-lg font-semibold">Last opp SOSI-fil</h2>
            <p className="mt-1 text-sm text-zinc-600">
              Støtter <span className="font-mono">.sos</span> og <span className="font-mono">.sosi</span>.
            </p>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <input
                type="file"
                accept=".sos,.sosi"
                onChange={(e) => {
                  const f = e.target.files?.[0] || null;
                  setFile(f);
                  setAnalysis(null);
                  setEncodingInfo(null);
                }}
              />
              <button
                type="button"
                disabled={!file || busy}
                className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                onClick={() => file && runAnalyze(file)}
              >
                {busy ? "Analyserer…" : "Analyser fil"}
              </button>
            </div>

            {file ? (
              <div className="mt-4 text-sm text-zinc-700">
                Valgt fil: <span className="font-medium">{file.name}</span>
              </div>
            ) : null}
          </section>
        ) : null}

        {step === "explore" && exploreData ? (
          <section className="rounded-lg border border-zinc-200 bg-white p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">Utforsk data</h2>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className={`rounded-md px-3 py-2 text-sm font-medium ${activeTab === "punkter" ? "bg-zinc-900 text-white" : "bg-white border border-zinc-200"}`}
                  onClick={() => setActiveTab("punkter")}
                >
                  Punkter
                </button>
                <button
                  type="button"
                  className={`rounded-md px-3 py-2 text-sm font-medium ${activeTab === "ledninger" ? "bg-zinc-900 text-white" : "bg-white border border-zinc-200"}`}
                  onClick={() => setActiveTab("ledninger")}
                >
                  Ledninger
                </button>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-6 lg:grid-cols-3">
              <div className="rounded-md border border-zinc-200 p-4">
                <div className="text-sm text-zinc-600">Antall objekter</div>
                <div className="mt-1 text-2xl font-semibold">{tabData.features.toLocaleString("nb-NO")}</div>
              </div>
              <div className="rounded-md border border-zinc-200 p-4">
                <div className="text-sm text-zinc-600">Unike objekttyper</div>
                <div className="mt-1 text-2xl font-semibold">{tabData.objTypes.length.toLocaleString("nb-NO")}</div>
              </div>
              <div className="rounded-md border border-zinc-200 p-4">
                <div className="text-sm text-zinc-600">Unike felter</div>
                <div className="mt-1 text-2xl font-semibold">{tabData.fields.length.toLocaleString("nb-NO")}</div>
              </div>
            </div>

            <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
              <div>
                <h3 className="text-sm font-semibold text-zinc-900">Objekttyper (topp 25)</h3>
                <div className="mt-2 max-h-80 overflow-auto rounded-md border border-zinc-200">
                  <table className="w-full text-sm">
                    <thead className="bg-zinc-50 text-zinc-600">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium">OBJTYPE</th>
                        <th className="px-3 py-2 text-right font-medium">Antall</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tabData.objTypes.slice(0, 25).map(([k, v]) => (
                        <tr key={k} className="border-t border-zinc-200">
                          <td className="px-3 py-2">{k}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{Number(v || 0).toLocaleString("nb-NO")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-zinc-900">Felter (topp 25)</h3>
                <div className="mt-2 max-h-80 overflow-auto rounded-md border border-zinc-200">
                  <table className="w-full text-sm">
                    <thead className="bg-zinc-50 text-zinc-600">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium">Felt</th>
                        <th className="px-3 py-2 text-right font-medium">Forekomst</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tabData.fields.slice(0, 25).map(([k, v]) => (
                        <tr key={k} className="border-t border-zinc-200">
                          <td className="px-3 py-2">{k}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{Number(v || 0).toLocaleString("nb-NO")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div className="mt-6 flex gap-2">
              <button
                type="button"
                className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white"
                onClick={() => setStep("filter")}
              >
                Gå til filtrering
              </button>
            </div>
          </section>
        ) : null}

        {step === "filter" && exploreData && available ? (
          <section className="rounded-lg border border-zinc-200 bg-white p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">Filtrer</h2>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className={`rounded-md px-3 py-2 text-sm font-medium ${activeTab === "punkter" ? "bg-zinc-900 text-white" : "bg-white border border-zinc-200"}`}
                  onClick={() => setActiveTab("punkter")}
                >
                  Punkter
                </button>
                <button
                  type="button"
                  className={`rounded-md px-3 py-2 text-sm font-medium ${activeTab === "ledninger" ? "bg-zinc-900 text-white" : "bg-white border border-zinc-200"}`}
                  onClick={() => setActiveTab("ledninger")}
                >
                  Ledninger
                </button>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-6 lg:grid-cols-2">
              <div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold">Objekttyper (keep)</h3>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium"
                      onClick={() => setAll(activeTab, "objTypes", available[activeTab].objTypes)}
                    >
                      Velg alle
                    </button>
                    <button
                      type="button"
                      className="rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium"
                      onClick={() => setAll(activeTab, "objTypes", [])}
                    >
                      Velg ingen
                    </button>
                  </div>
                </div>

                <div className="mt-2 max-h-104 overflow-auto rounded-md border border-zinc-200 p-2">
                  {available[activeTab].objTypes.map((objType) => {
                    const checked = selectedObjTypes.includes(objType);
                    return (
                      <label key={objType} className="flex items-center gap-2 rounded px-2 py-1 hover:bg-zinc-50">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => {
                            setSelection((prev) => ({
                              ...prev,
                              objTypesByCategory: {
                                ...prev.objTypesByCategory,
                                [activeTab]: toggleInList(prev.objTypesByCategory?.[activeTab] || [], objType),
                              },
                            }));
                          }}
                        />
                        <span className="text-sm">{objType}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold">Felter (keep)</h3>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium"
                      onClick={() => setAll(activeTab, "fields", uniq([...available[activeTab].fields, ...Array.from(mandatoryFields)]))}
                    >
                      Velg alle
                    </button>
                    <button
                      type="button"
                      className="rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium"
                      onClick={() => setAll(activeTab, "fields", Array.from(mandatoryFields))}
                    >
                      Velg ingen
                    </button>
                  </div>
                </div>

                <div className="mt-2 max-h-104 overflow-auto rounded-md border border-zinc-200 p-2">
                  {uniq([...available[activeTab].fields, ...Array.from(mandatoryFields)]).map((fieldKey) => {
                    const keyUpper = String(fieldKey).toUpperCase();
                    const locked = mandatoryFields.has(keyUpper);
                    const checked = locked || selectedFields.map((f) => String(f).toUpperCase()).includes(keyUpper);
                    return (
                      <label key={fieldKey} className="flex items-center gap-2 rounded px-2 py-1 hover:bg-zinc-50">
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={locked}
                          onChange={() => {
                            if (locked) return;
                            setSelection((prev) => ({
                              ...prev,
                              fieldsByCategory: {
                                ...prev.fieldsByCategory,
                                [activeTab]: toggleInList(prev.fieldsByCategory?.[activeTab] || [], keyUpper),
                              },
                            }));
                          }}
                        />
                        <span className={`text-sm ${locked ? "text-zinc-500" : ""}`}>{fieldKey}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="mt-6 flex flex-wrap items-center gap-2">
              <button
                type="button"
                className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white"
                onClick={() => setStep("download")}
              >
                Gå til nedlasting
              </button>
              <button
                type="button"
                className="rounded-md border border-zinc-200 bg-white px-4 py-2 text-sm font-medium"
                onClick={() => ensureDefaultsFromAnalysis()}
              >
                Tilbakestill til standard (fra fil)
              </button>
              <button
                type="button"
                className="rounded-md border border-zinc-200 bg-white px-4 py-2 text-sm font-medium"
                onClick={exportSettings}
              >
                Eksporter utvalg (JSON)
              </button>
              <label className="rounded-md border border-zinc-200 bg-white px-4 py-2 text-sm font-medium cursor-pointer">
                Importer utvalg (JSON)
                <input
                  type="file"
                  accept="application/json,.json"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) importSettingsFromFile(f);
                    e.target.value = "";
                  }}
                />
              </label>
              <button
                type="button"
                className="rounded-md border border-zinc-200 bg-white px-4 py-2 text-sm font-medium"
                onClick={clearSavedSettings}
              >
                Slett lagrede innstillinger
              </button>
            </div>
          </section>
        ) : null}

        {step === "download" ? (
          <section className="rounded-lg border border-zinc-200 bg-white p-6">
            <h2 className="text-lg font-semibold">Last ned renset fil</h2>
            <p className="mt-1 text-sm text-zinc-600">
              Viktig: Du er selv ansvarlig for at eksportert fil ikke inneholder sensitiv informasjon.
            </p>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={!file || busy}
                className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                onClick={downloadCleaned}
              >
                {busy ? "Genererer…" : "Last ned renset SOSI"}
              </button>
              <button
                type="button"
                className="rounded-md border border-zinc-200 bg-white px-4 py-2 text-sm font-medium"
                onClick={() => setStep("filter")}
              >
                Tilbake til filtrering
              </button>
            </div>
          </section>
        ) : null}
      </main>
    </div>
  );
}
