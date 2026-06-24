// visualizer/app.js

const SAMPLE_DESCRIPTIONS = {
  "250804_BK_empty": "Blanco de Sistema - Vial Vacío",
  "250812_barley_powder": "Hierba de Cebada en Polvo",
  "250813_CMC_BK": "Blanco de Polímero - CMC Puro",
  "250814_CMC_BW": "CMC con Extracto Acuoso de Cebada",
  "250815_CMC_BE": "CMC con Extracto Etanólico de Cebada",
  "250816_CMC_BWE": "CMC con Extracto Etanol-Agua (1:1 v:v) de Cebada",
  "250817_extract_EW_100uL": "Extracto Agua-Etanol (1:1 v:v) de Cebada (100 µL)",
  "250817_extract_E_100uL": "Extracto Etanólico de Cebada (100 µL)",
  "250817_extract_W_100uL": "Extracto Acuoso de Cebada (100 µL)",
  "20260518_Alkanes_C8_C24_3": "Estándar de Calibración de Alcanos (C12-C24)"
};

// State management
let state = {
  sampleData: null,       // Active sample data
  selectedPeak: null,     // Selected peak object
  searchQuery: '',        // Search filter text
  activeFilter: 'all'     // Active tab filter: 'all', 'lib', 'unmatched'
};

// DOM Elements
const sampleSelect = document.getElementById('sampleSelect');
const peakCountIndicator = document.getElementById('peakCountIndicator');
const searchInput = document.getElementById('searchInput');
const peakTableBody = document.getElementById('peakTableBody');
const chromatogramIndicator = document.getElementById('chromatogramIndicator');
const btnResetChromZoom = document.getElementById('btnResetChromZoom');
const chromSelectionSummary = document.getElementById('chromSelectionSummary');

// Detail Pane Elements
const emptyDetailsState = document.getElementById('emptyDetailsState');
const activeDetailsState = document.getElementById('activeDetailsState');
const detPeakId = document.getElementById('detPeakId');
const detRtCorrected = document.getElementById('detRtCorrected');
const detMz = document.getElementById('detMz');
const detAbundance = document.getElementById('detAbundance');
const detCas = document.getElementById('detCas');
const detMw = document.getElementById('detMw');
const detRi = document.getElementById('detRi');
const detLibScore = document.getElementById('detLibScore');
const detName = document.getElementById('detName');
const detFormula = document.getElementById('detFormula');
const detTypeBadge = document.getElementById('detTypeBadge');

// External Links & Actions
const linkPubChem = document.getElementById('linkPubChem');
const linkNIST = document.getElementById('linkNIST');
const linkChemSpider = document.getElementById('linkChemSpider');
const btnExportMsp = document.getElementById('btnExportMsp');

// Spectra Placeholders & Panels
const expPlaceholder = document.getElementById('expPlaceholder');
const mirrorPlaceholder = document.getElementById('mirrorPlaceholder');
const eicPanel = document.getElementById('eicPanel');

// Plotly Plot Div IDs
const CHROMATOGRAM_DIV = 'chromatogramPlot';
const EXP_SPECTRUM_DIV = 'expSpectraPlot';
const MIRROR_SPECTRUM_DIV = 'mirrorSpectraPlot';
const EIC_DIV = 'eicPlot';

// Initialize App
window.addEventListener('DOMContentLoaded', () => {
  if (typeof Plotly === 'undefined') {
    alert("Plotly did not load. Please check vendor/plotly-2.24.1.min.js.");
    return;
  }

  loadSample(sampleSelect.value);
  
  // Set up event listeners
  sampleSelect.addEventListener('change', (e) => loadSample(e.target.value));
  searchInput.addEventListener('input', (e) => handleSearch(e.target.value));
  
  // Filter tabs listeners
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      setFilter(e.target.dataset.filter);
    });
  });
  
  btnResetChromZoom.addEventListener('click', resetChromatogramZoom);
  btnExportMsp.addEventListener('click', exportSelectedPeakMSP);
});

// Load sample JS data dynamically
function loadSample(sampleName) {
  chromatogramIndicator.textContent = "Loading...";
  chromatogramIndicator.style.color = "var(--text-secondary)";
  
  try {
    // Check if data is already loaded in cache
    if (window.msDataCache && window.msDataCache[sampleName]) {
      onDataLoaded(window.msDataCache[sampleName]);
      return;
    }
    
    // Create script tag to dynamically fetch the data file (bypasses CORS in file://)
    const script = document.createElement('script');
    script.src = `data/${encodeURIComponent(sampleName)}.js?v=${Date.now()}`;
    script.onload = () => {
      if (window.msDataCache && window.msDataCache[sampleName]) {
        onDataLoaded(window.msDataCache[sampleName]);
      } else {
        showError(new Error("Invalid JS data structure."));
      }
    };
    script.onerror = () => {
      showError(new Error(`Could not load data/${sampleName}.js. Have you executed scripts/analisis_cualitativo.py?`));
    };
    document.body.appendChild(script);
    
  } catch (error) {
    showError(error);
  }
}

// Show error messages
function showError(error) {
  console.error(error);
  chromatogramIndicator.textContent = "Error";
  chromatogramIndicator.style.color = "#ef4444";
  alert(`Error loading data: ${error.message}`);
}

// Trigger state updates once data is loaded
function onDataLoaded(data) {
  state.sampleData = data;
  state.selectedPeak = null;
  
  chromatogramIndicator.textContent = "Ready";
  chromatogramIndicator.style.color = "var(--color-lib-text)";
  
  clearDetails();
  renderChromatogram();
  renderPeakTable();
}

// Handle search filter
function handleSearch(query) {
  state.searchQuery = query.toLowerCase().trim();
  renderPeakTable();
}

// Set active filter tab
function setFilter(filterType) {
  state.activeFilter = filterType;
  renderPeakTable();
}

// Clear detail cards & plots
function clearDetails() {
  state.selectedPeak = null;
  emptyDetailsState.style.display = "flex";
  activeDetailsState.style.display = "none";
  eicPanel.style.display = "none";
  
  expPlaceholder.style.display = "flex";
  mirrorPlaceholder.style.display = "flex";
  chromSelectionSummary.textContent = "No peak selected. Yellow diamonds indicate active peaks in the table.";
  
  Plotly.purge(EXP_SPECTRUM_DIV);
  Plotly.purge(MIRROR_SPECTRUM_DIV);
  Plotly.purge(EIC_DIV);
}

// Select a specific peak
function selectPeak(peak) {
  state.selectedPeak = peak;
  
  // Highlight row in table
  document.querySelectorAll('#peakTableBody tr').forEach(row => {
    if (row.dataset.peakId === peak.id) {
      row.classList.add('selected');
      row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    } else {
      row.classList.remove('selected');
    }
  });
  
  // Populate Detail Card
  showPeakDetails(peak);
  
  // Render Plots
  renderEIC(peak);
  renderExperimentalSpectrum(peak);
  renderMirrorSpectrum(peak);
  
  // Update Selection Summary label
  const isIdentified = peak.library_match !== null;
  const annotation = isIdentified ? peak.library_match.name : 'Unidentified';
  const mfText = isIdentified ? ` (NIST MF: ${peak.library_match.score.toFixed(1)})` : '';
  chromSelectionSummary.textContent = `${peak.id}: RT ${peak.rt_corrected.toFixed(3)} min | Base Ion m/z ${peak.mz.toFixed(1)} | Identification: ${annotation}${mfText}`;
  
  // Re-draw chromatogram to update marker
  renderChromatogram();
}

// Populates detail card details
function showPeakDetails(peak) {
  emptyDetailsState.style.display = "none";
  activeDetailsState.style.display = "block";
  
  detPeakId.textContent = peak.id;
  detRtCorrected.textContent = `${peak.rt_corrected.toFixed(3)} min (${(peak.rt_corrected * 60).toFixed(0)} s)`;
  detMz.textContent = peak.mz.toFixed(1);
  detAbundance.textContent = Number(peak.intensity.toFixed(0)).toLocaleString('en-US');
  
  const isIdentified = peak.library_match !== null;
  
  if (isIdentified) {
    const match = peak.library_match;
    detName.textContent = match.name;
    detFormula.textContent = match.formula || "No formula assigned";
    detCas.textContent = match.cas_number || "--";
    detMw.textContent = match.mw !== null ? `${match.mw.toFixed(1)} Da` : "--";
    detRi.textContent = match.retention_index !== null ? match.retention_index.toFixed(0) : "--";
    detLibScore.textContent = `${match.score.toFixed(1)} / 100`;
    
    detTypeBadge.textContent = "Identified (NIST 17)";
    detTypeBadge.className = "compound-type-badge lib";
    
    setupExternalLinks(match.name, match.cas_number);
  } else {
    detName.textContent = "Unidentified substance";
    detFormula.textContent = "--";
    detCas.textContent = "--";
    detMw.textContent = "--";
    detRi.textContent = "--";
    detLibScore.textContent = "0.0";
    
    detTypeBadge.textContent = "Unidentified";
    detTypeBadge.className = "compound-type-badge unmatched";
    
    setupExternalLinks("", "");
  }
}

// Generate external database search links
function setupExternalLinks(name, cas) {
  const query = encodeURIComponent(name);
  
  linkPubChem.href = name ? `https://pubchem.ncbi.nlm.nih.gov/#query=${query}` : "#";
  linkNIST.href = cas ? `https://webbook.nist.gov/cgi/cbook.cgi?ID=${cas}&Units=SI` : (name ? `https://webbook.nist.gov/cgi/cbook.cgi?Name=${query}&Units=SI` : "#");
  linkChemSpider.href = name ? `http://www.chemspider.com/Search.aspx?q=${query}` : "#";
}

// Render Chromatogram using Plotly.js
function renderChromatogram() {
  if (!state.sampleData) return;
  
  const chrom = state.sampleData.chromatogram;
  
  // 1. TIC profile line
  const mainTrace = {
    x: chrom.rt,
    y: chrom.tic,
    mode: 'lines',
    name: 'TIC Chromatogram',
    line: {
      color: '#f97316',
      width: 1.5
    },
    hoverinfo: 'x+y'
  };
  
  // 2. Peak markers scatter points
  const peakX = [];
  const peakY = [];
  const peakHover = [];
  
  state.sampleData.peaks.forEach(p => {
    peakX.push(p.rt_corrected);
    
    // Find closest index in global RT array to position marker exactly on TIC
    let closestIdx = 0;
    let minDiff = Infinity;
    for (let i = 0; i < chrom.rt.length; i++) {
      let diff = Math.abs(chrom.rt[i] - p.rt_corrected);
      if (diff < minDiff) {
        minDiff = diff;
        closestIdx = i;
      }
    }
    peakY.push(chrom.tic[closestIdx]);
    
    const idName = p.library_match ? p.library_match.name : 'Unidentified';
    const scoreText = p.library_match ? ` (NIST MF: ${p.library_match.score.toFixed(0)})` : '';
    peakHover.push(`<b>${p.id}</b><br>RT: ${p.rt_corrected.toFixed(3)} min<br>Base Ion: ${p.mz.toFixed(1)} m/z<br>ID: ${idName}${scoreText}`);
  });
  
  const peaksTrace = {
    x: peakX,
    y: peakY,
    mode: 'markers',
    name: 'Detected Peaks',
    marker: {
      color: 'rgba(239, 68, 68, 0.85)',
      size: 7,
      symbol: 'circle',
      line: { width: 1, color: '#ef4444' }
    },
    hovertext: peakHover,
    hoverinfo: 'text'
  };
  
  const traces = [mainTrace, peaksTrace];
  
  // 3. Highlighted active selected peak marker
  if (state.selectedPeak) {
    const selected = state.selectedPeak;
    let closestIdx = 0;
    let minDiff = Infinity;
    for (let i = 0; i < chrom.rt.length; i++) {
      let diff = Math.abs(chrom.rt[i] - selected.rt_corrected);
      if (diff < minDiff) {
        minDiff = diff;
        closestIdx = i;
      }
    }
    traces.push({
      x: [selected.rt_corrected],
      y: [chrom.tic[closestIdx]],
      mode: 'markers',
      name: 'Selected',
      marker: {
        color: '#facc15',
        size: 11,
        symbol: 'diamond',
        line: { width: 1.5, color: '#000' }
      },
      hoverinfo: 'none'
    });
  }
  
  const layout = {
    paper_bgcolor: 'rgba(0,0,0,0)',
    plot_bgcolor: 'rgba(0,0,0,0)',
    margin: { l: 70, r: 25, t: 15, b: 40 },
    showlegend: true,
    uirevision: state.sampleData.sample_name,
    legend: {
      x: 0.5,
      y: 1.12,
      xanchor: 'center',
      yanchor: 'bottom',
      orientation: 'h',
      font: { color: '#94a3b8', size: 10 },
      bgcolor: 'rgba(10, 12, 16, 0.6)'
    },
    hovermode: 'closest',
    xaxis: {
      title: { text: 'Retention Time (minutes)', font: { size: 11, color: '#94a3b8' } },
      gridcolor: 'rgba(255, 255, 255, 0.03)',
      tickfont: { color: '#64748b', size: 9 },
      zeroline: false
    },
    yaxis: {
      title: { text: 'Abundance Intensity (TIC)', font: { size: 11, color: '#94a3b8' } },
      gridcolor: 'rgba(255, 255, 255, 0.03)',
      tickfont: { color: '#64748b', size: 9 },
      zeroline: false,
      exponentformat: 'e'
    },
    shapes: state.selectedPeak ? [{
      type: 'line',
      x0: state.selectedPeak.rt_corrected,
      x1: state.selectedPeak.rt_corrected,
      y0: 0,
      y1: 1,
      xref: 'x',
      yref: 'paper',
      line: { color: '#facc15', width: 1, dash: 'dot' }
    }] : []
  };
  
  const config = {
    responsive: true,
    displayModeBar: true,
    modeBarButtonsToRemove: ['select2d', 'lasso2d', 'toggleSpikelines']
  };
  
  Plotly.react(CHROMATOGRAM_DIV, traces, layout, config);
  
  // Set up click handler
  const graphDiv = document.getElementById(CHROMATOGRAM_DIV);
  graphDiv.on('plotly_click', (data) => {
    if (data.points && data.points.length > 0) {
      const point = data.points[0];
      // Check if clicked point belongs to the peaks trace (trace index 1)
      if (point.curveNumber === 1) {
        const clickedPeak = state.sampleData.peaks[point.pointNumber];
        if (clickedPeak) {
          selectPeak(clickedPeak);
        }
      }
    }
  });
}

function resetChromatogramZoom() {
  if (!state.sampleData) return;
  Plotly.relayout(CHROMATOGRAM_DIV, {
    'xaxis.autorange': true,
    'yaxis.autorange': true
  });
}

// Render local EIC profile under the TIC
function renderEIC(peak) {
  if (!peak.eic || !Array.isArray(peak.eic.rt) || peak.eic.rt.length === 0) {
    eicPanel.style.display = "none";
    Plotly.purge(EIC_DIV);
    return;
  }

  eicPanel.style.display = "block";
  
  const trace = {
    x: peak.eic.rt,
    y: peak.eic.intensity,
    mode: 'lines+markers',
    name: `EIC m/z ${peak.mz.toFixed(1)}`,
    line: { color: '#fb923c', width: 2 },
    marker: { color: '#fb923c', size: 3.5 },
    hovertemplate: 'RT: %{x:.3f} min<br>Intensity: %{y:.2e}<extra></extra>'
  };

  const apexTrace = {
    x: [peak.rt_corrected],
    y: [Math.max(...peak.eic.intensity)],
    mode: 'markers',
    name: 'Apex',
    marker: {
      color: '#facc15',
      size: 9,
      symbol: 'diamond',
      line: { width: 1, color: '#111827' }
    },
    hovertemplate: 'Apex RT: %{x:.3f} min<extra></extra>'
  };

  const layout = {
    paper_bgcolor: 'rgba(0,0,0,0)',
    plot_bgcolor: 'rgba(0,0,0,0)',
    margin: { l: 70, r: 25, t: 10, b: 35 },
    showlegend: true,
    legend: {
      x: 0.5,
      y: 1.15,
      xanchor: 'center',
      yanchor: 'bottom',
      orientation: 'h',
      font: { color: '#94a3b8', size: 9 },
      bgcolor: 'rgba(10, 12, 16, 0.5)'
    },
    xaxis: {
      title: { text: 'Local Time (min)', font: { size: 10, color: '#94a3b8' } },
      gridcolor: 'rgba(255,255,255,0.03)',
      tickfont: { color: '#64748b', size: 9 },
      zeroline: false
    },
    yaxis: {
      title: { text: 'EIC Signal', font: { size: 10, color: '#94a3b8' } },
      gridcolor: 'rgba(255,255,255,0.03)',
      tickfont: { color: '#64748b', size: 9 },
      zeroline: false,
      exponentformat: 'e'
    }
  };

  const config = {
    responsive: true,
    displayModeBar: false
  };

  Plotly.react(EIC_DIV, [trace, apexTrace], layout, config);
}

// Render Experimental MS Spectrum
function renderExperimentalSpectrum(peak) {
  expPlaceholder.style.display = "none";
  
  const mzs = peak.experimental_spectrum.map(p => p.mz);
  const intensities = peak.experimental_spectrum.map(p => p.rel_int);
  
  const trace = {
    x: mzs,
    y: intensities,
    type: 'bar',
    name: 'Experimental EI',
    marker: {
      color: '#3b82f6',
      width: 1.0
    },
    hovertemplate: 'm/z: %{x:.1f}<br>Relative Int: %{y:.1f}%<extra></extra>'
  };
  
  const layout = {
    paper_bgcolor: 'rgba(0,0,0,0)',
    plot_bgcolor: 'rgba(0,0,0,0)',
    margin: { l: 60, r: 20, t: 15, b: 35 },
    xaxis: {
      title: { text: 'Mass-to-charge ratio (m/z)', font: { size: 11, color: '#94a3b8' } },
      gridcolor: 'rgba(255, 255, 255, 0.03)',
      tickfont: { color: '#64748b', size: 9 },
      range: [40, 420],
      zeroline: false
    },
    yaxis: {
      title: { text: 'Relative Abundance (%)', font: { size: 11, color: '#94a3b8' } },
      gridcolor: 'rgba(255, 255, 255, 0.03)',
      tickfont: { color: '#64748b', size: 9 },
      range: [0, 105],
      zeroline: false
    }
  };
  
  const config = { responsive: true, displayModeBar: false };
  Plotly.react(EXP_SPECTRUM_DIV, [trace], layout, config);
}

// Render Head-to-Tail Mirror plot
function renderMirrorSpectrum(peak) {
  mirrorPlaceholder.style.display = "none";
  
  if (!peak.library_match) {
    Plotly.purge(MIRROR_SPECTRUM_DIV);
    mirrorPlaceholder.style.display = "flex";
    mirrorPlaceholder.querySelector('span').textContent = "No NIST 17 library match available for this peak.";
    return;
  }
  
  const lib = peak.library_match;
  
  const expMzs = peak.experimental_spectrum.map(p => p.mz);
  const expInts = peak.experimental_spectrum.map(p => p.rel_int);
  
  const libMzs = lib.reference_spectrum.map(p => p.mz);
  // Negative values for bottom mirroring
  const libInts = lib.reference_spectrum.map(p => -p.rel_int);
  
  const expTrace = {
    x: expMzs,
    y: expInts,
    type: 'bar',
    name: 'Experimental (Subtracted)',
    marker: {
      color: '#3b82f6',
      width: 1.0
    },
    hovertemplate: 'm/z: %{x:.1f}<br>Exp Int: %{y:.1f}%<extra></extra>'
  };
  
  const libTrace = {
    x: libMzs,
    y: libInts,
    type: 'bar',
    name: `Library: ${lib.name}`,
    marker: {
      color: '#ef4444',
      width: 1.0
    },
    hovertemplate: 'm/z: %{x:.1f}<br>Lib Int: %{y:.1f}%<extra></extra>'
  };
  
  const layout = {
    paper_bgcolor: 'rgba(0,0,0,0)',
    plot_bgcolor: 'rgba(0,0,0,0)',
    margin: { l: 60, r: 20, t: 15, b: 35 },
    showlegend: true,
    legend: {
      x: 0.5,
      y: 1.12,
      xanchor: 'center',
      yanchor: 'bottom',
      orientation: 'h',
      font: { color: '#94a3b8', size: 9 },
      bgcolor: 'rgba(10, 12, 16, 0.5)'
    },
    xaxis: {
      title: { text: 'Mass-to-charge ratio (m/z)', font: { size: 11, color: '#94a3b8' } },
      gridcolor: 'rgba(255, 255, 255, 0.03)',
      tickfont: { color: '#64748b', size: 9 },
      range: [40, 420],
      zeroline: false
    },
    yaxis: {
      title: { text: 'Tail (-) / Head (+) (%)', font: { size: 11, color: '#94a3b8' } },
      gridcolor: 'rgba(255, 255, 255, 0.03)',
      tickfont: { color: '#64748b', size: 9 },
      range: [-105, 105],
      zeroline: false
    }
  };
  
  // Custom format function for absolute values on y-axis ticklabels
  const graphDiv = document.getElementById(MIRROR_SPECTRUM_DIV);
  Plotly.react(graphDiv, [expTrace, libTrace], layout, { responsive: true, displayModeBar: false }).then(() => {
    const update = {
      'yaxis.ticktext': [-100, -80, -60, -40, -20, 0, 20, 40, 60, 80, 100],
      'yaxis.tickvals': [-100, -80, -60, -40, -20, 0, 20, 40, 60, 80, 100]
    };
    Plotly.relayout(graphDiv, update);
  });
}

// Populates peak list table on the right
function renderPeakTable() {
  peakTableBody.innerHTML = '';
  
  if (!state.sampleData) return;
  
  // Filter and search peaks
  const filteredPeaks = state.sampleData.peaks.filter(p => {
    const matchesSearch = p.id.toLowerCase().includes(state.searchQuery) ||
      p.rt_corrected.toFixed(3).includes(state.searchQuery) ||
      p.mz.toFixed(1).includes(state.searchQuery) ||
      (p.library_match && p.library_match.name.toLowerCase().includes(state.searchQuery));
      
    if (!matchesSearch) return false;
    
    if (state.activeFilter === 'lib') {
      return p.library_match !== null;
    }
    if (state.activeFilter === 'unmatched') {
      return p.library_match === null;
    }
    return true;
  });
  
  peakCountIndicator.textContent = `(${filteredPeaks.length})`;
  
  filteredPeaks.forEach(p => {
    const tr = document.createElement('tr');
    tr.dataset.peakId = p.id;
    if (state.selectedPeak && state.selectedPeak.id === p.id) {
      tr.className = 'selected';
    }
    
    const isIdentified = p.library_match !== null;
    const matchClass = isIdentified ? 'match-dot lib' : 'match-dot unmatched';
    const matchName = isIdentified ? p.library_match.name : 'Unidentified';
    
    tr.innerHTML = `
      <td style="font-weight: 600;">${p.id}</td>
      <td style="text-align: right; color: var(--text-secondary);">${p.rt_corrected.toFixed(3)}</td>
      <td style="text-align: right; color: var(--text-secondary);">${p.mz.toFixed(1)}</td>
      <td>
        <span class="${matchClass}"></span>
        <span style="font-weight: 500;">${matchName}</span>
      </td>
    `;
    
    tr.addEventListener('click', () => selectPeak(p));
    peakTableBody.appendChild(tr);
  });
}

// Export raw mass spectrum in NIST MSP text format
function exportSelectedPeakMSP() {
  const peak = state.selectedPeak;
  if (!peak) return;
  
  const isIdentified = peak.library_match !== null;
  const name = isIdentified ? peak.library_match.name : `Unknown_Peak_${peak.id}`;
  const formula = isIdentified ? peak.library_match.formula : '';
  const mw = isIdentified && peak.library_match.mw ? peak.library_match.mw.toFixed(0) : '';
  const cas = isIdentified ? peak.library_match.cas_number : '';
  
  let msp = `Name: ${name}\n`;
  if (formula) msp += `Formula: ${formula}\n`;
  if (mw) msp += `MW: ${mw}\n`;
  if (cas) msp += `CAS#: ${cas}\n`;
  const desc = SAMPLE_DESCRIPTIONS[state.sampleData.sample_name] || "";
  msp += `Comment: Sample: ${state.sampleData.sample_name} (${desc}) | RT: ${peak.rt_corrected.toFixed(3)} min | Base Ion m/z: ${peak.mz.toFixed(1)}\n`;
  msp += `Num Peaks: ${peak.experimental_spectrum.length}\n`;
  
  peak.experimental_spectrum.forEach(p => {
    msp += `${p.mz.toFixed(1)} ${p.rel_int.toFixed(1)}\n`;
  });
  
  // Trigger text file download
  const blob = new Blob([msp], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `peak_${peak.id}_${name.replace(/[^a-zA-Z0-9]/g, '_')}.msp`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
