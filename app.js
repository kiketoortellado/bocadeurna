import { initializeApp } from "firebase/app";
import { getAuth, setPersistence, signInWithEmailAndPassword, browserLocalPersistence, signOut, onAuthStateChanged } from "firebase/auth";
import { getFirestore, doc, getDoc, setDoc, updateDoc, collection, onSnapshot, query, orderBy, limit, writeBatch } from "firebase/firestore";

// Configuración de Firebase
const firebaseConfig = {
    apiKey: "AIzaSyDezSI6Q--Fy25nOiu5zmgfxL2hre3nf2g",
    authDomain: "bocadeurna-2ab6d.firebaseapp.com",
    projectId: "bocadeurna-2ab6d",
    storageBucket: "bocadeurna-2ab6d.firebasestorage.app",
    messagingSenderId: "23922491266",
    appId: "1:23922491266:web:5e33115d92b4667e5bd99b",
    measurementId: "G-RCND17FP57"
};

// Inicializar Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Configurar persistencia local
await setPersistence(auth, browserLocalPersistence);

// -------------------- DATOS ESTÁTICOS --------------------
let locales = ["Gimnasio Municipal", "Colegio Nacional Sebastián de Yegros", "Esc. Carlos Antonio López"];
let intendentes = [
    { id: "int_ANR", nombre: "Candidato ANR", partido: "ANR" },
    { id: "int_PLRA", nombre: "Candidato PLRA", partido: "PLRA" },
    { id: "int_BLANCO", nombre: "Voto en Blanco", partido: "BLANCO" }
];
let listasConcejales = {
    "lista_1": { nombre: "Lista 1 - ANR", candidatos: [{ id: "c_l1_o1", nombre: "Juan Pérez", opcion: "1" }, { id: "c_l1_o2", nombre: "María Galeano", opcion: "2" }] },
    "lista_2": { nombre: "Lista 2 - PLRA", candidatos: [{ id: "c_l2_o1", nombre: "Carlos Vera", opcion: "1" }, { id: "c_l2_o2", nombre: "Ana Espínola", opcion: "2" }] },
    "lista_99": { nombre: "Votos en Blanco", candidatos: [{ id: "c_blanco", nombre: "Blanco/Nulo", opcion: "0" }] }
};

let currentUser = null;
let votosIntendentes = {};     
let votosConcejales = {};      
let cargas = [];               
let currentStep = "local"; 
let selectedLocal = "";
let selectedIntendente = "";
let selectedLista = "";

let chartInt, chartList;

function inyectarEstilosProfesionales() {
    if (document.getElementById("radio-nasa-styles")) return;
    const styleEl = document.createElement("style");
    styleEl.id = "radio-nasa-styles";
    styleEl.textContent = `
        :root {
            --radio-green: #0d523c;
            --radio-green-hover: #073325;
            --radio-green-light: #e6f1ed;
            --radio-fuchsia: #df1660;
            --radio-fuchsia-hover: #b50e4b;
            --radio-fuchsia-light: #fdf2f6;
            --radio-white: #ffffff;
            --radio-bg: #f4f7f6;
            --radio-text: #1e293b;
            --radio-text-muted: #64748b;
            --radio-border: #e2e8f0;
            --shadow-card: 0 10px 25px -5px rgba(13, 82, 60, 0.05), 0 8px 10px -6px rgba(0, 0, 0, 0.03);
            --shadow-button: 0 4px 14px rgba(13, 82, 60, 0.2);
            --shadow-fuchsia: 0 4px 14px rgba(223, 22, 96, 0.25);
            --shadow-modal: 0 25px 50px -12px rgba(0, 0, 0, 0.15);
            --radius-lg: 20px;
            --radius-md: 14px;
            --radius-sm: 8px;
            --transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .logout-btn-revert {
            background: var(--radio-fuchsia);
            color: white;
            border: none;
            padding: 6px 12px;
            border-radius: var(--radius-sm);
            font-weight: 600;
            cursor: pointer;
            transition: var(--transition);
        }
        .logout-btn-revert:hover {
            background: var(--radio-fuchsia-hover);
        }
    `;
    document.head.appendChild(styleEl);
}

function mostrarNotificacion(mensaje, tipo = 'info') {
    let container = document.getElementById('app-toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'app-toast-container';
        container.className = 'toast-container';
        document.body.appendChild(container);
    }
    const toast = document.createElement('div');
    toast.className = `toast-card ${tipo}`;
    toast.innerHTML = `<span style="line-height: 1.3;">${mensaje}</span>`;
    container.appendChild(toast);
    setTimeout(() => {
        toast.remove();
    }, 4000);
}

function renderAdminPanel() {
    const adminPanel = document.getElementById("adminPanel");
    adminPanel.innerHTML = `
        <div class="admin-area">
            <div class="admin-header">
                <h2><i class="fas fa-chart-line"></i> Panel de Control - Radio Ñasaindy 620 AM</h2>
                <button class="logout-btn" id="logoutBtn"><i class="fas fa-sign-out-alt"></i> Salir</button>
            </div>
            
            <div class="admin-tabs">
                <button class="tab-btn active" data-tab="tab-dashboard">Tendencias Globales</button>
                <button class="tab-btn" data-tab="tab-gestion">Gestión de Carga</button>
                <button class="tab-btn" data-tab="tab-auditoria">Auditoría de Carga</button>
            </div>

            <div id="tab-dashboard" class="tab-content active">
                <div class="charts-panel">
                    <div class="chart-card">
                        <h3>Tendencia Intendentes</h3>
                        <canvas id="chartIntendentes"></canvas>
                    </div>
                    <div class="chart-card">
                        <h3>Tendencia Global de Votos por Lista</h3>
                        <canvas id="chartConcejales"></canvas>
                    </div>
                </div>
            </div>

            <div id="tab-gestion" class="tab-content">
                <div class="admin-quick-vote">
                    <h3><i class="fas fa-edit"></i> Gestión de Carga</h3>
                    <div class="quick-vote-grid">
                        <select id="qvLocal"><option value="">Seleccione Local...</option>${locales.map(l=>`<option value="${l}">${l}</option>`).join('')}</select>
                        <select id="qvTipo" disabled><option value="">Seleccione Tipo...</option><option value="intendente">Intendente</option><option value="concejal">Concejal</option></select>
                        <select id="qvCandidato" disabled><option value="">Seleccione Opción...</option></select>
                        <input type="number" id="qvCantidad" placeholder="Cantidad de Votos" min="1" disabled>
                        <button id="btnQVSubmit" disabled>Transmitir Carga</button>
                    </div>
                </div>
            </div>

            <div id="tab-auditoria" class="tab-content">
                <div class="results-section">
                    <h3><i class="fas fa-history"></i> Auditoría de Carga</h3>
                    <div id="logsContainer"></div>
                </div>
            </div>
        </div>
    `;
    setupAdminTabs();
    setupGestionCargaEvents();
}

function setupAdminTabs() {
    const tabs = document.querySelectorAll(".tab-btn");
    tabs.forEach(tab => {
        tab.addEventListener("click", () => {
            document.querySelectorAll(".tab-btn").forEach(t => t.classList.remove("active"));
            document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));
            tab.classList.add("active");
            document.getElementById(tab.dataset.tab).classList.add("active");
            if(tab.dataset.tab === "tab-dashboard") {
                renderCharts();
            }
        });
    });
    document.getElementById("logoutBtn").addEventListener("click", () => signOut(auth));
}

function setupGestionCargaEvents() {
    const qvLocal = document.getElementById("qvLocal");
    const qvTipo = document.getElementById("qvTipo");
    const qvCandidato = document.getElementById("qvCandidato");
    const qvCantidad = document.getElementById("qvCantidad");
    const btnQVSubmit = document.getElementById("btnQVSubmit");

    qvLocal.addEventListener("change", () => {
        if(qvLocal.value) qvTipo.disabled = false;
        else { qvTipo.disabled = true; qvCandidato.disabled = true; qvCantidad.disabled = true; btnQVSubmit.disabled = true; }
    });

    qvTipo.addEventListener("change", () => {
        if(!qvTipo.value) { qvCandidato.disabled = true; qvCantidad.disabled = true; btnQVSubmit.disabled = true; return; }
        qvCandidato.disabled = false;
        qvCandidato.innerHTML = '<option value="">Seleccione Opción...</option>';
        if(qvTipo.value === "intendente") {
            intendentes.forEach(i => { qvCandidato.innerHTML += `<option value="${i.id}">${i.nombre} (${i.partido})</option>`; });
        } else {
            Object.keys(listasConcejales).forEach(k => {
                listasConcejales[k].candidatos.forEach(c => {
                    qvCandidato.innerHTML += `<option value="${c.id}">${listasConcejales[k].nombre} - Opción ${c.opcion}: ${c.nombre}</option>`;
                });
            });
        }
        qvCantidad.disabled = false;
        btnQVSubmit.disabled = false;
    });

    btnQVSubmit.addEventListener("click", async () => {
        const local = qvLocal.value;
        const tipo = qvTipo.value;
        const candId = qvCandidato.value;
        const cant = parseInt(qvCantidad.value);

        if(!local || !tipo || !candId || isNaN(cant) || cant <= 0) {
            mostrarNotificacion("Complete todos los campos con valores válidos.", "error");
            return;
        }

        let candNombre = "";
        if(tipo === "intendente") {
            candNombre = intendentes.find(i=>i.id === candId)?.nombre || "";
        } else {
            Object.keys(listasConcejales).forEach(k => {
                const f = listasConcejales[k].candidatos.find(c=>c.id === candId);
                if(f) candNombre = `${listasConcejales[k].nombre} - ${f.nombre}`;
            });
        }

        try {
            const batch = writeBatch(db);
            const path = tipo === "intendente" ? `votos_intendentes/${local}` : `votos_concejales/${local}`;
            const docRef = doc(db, path);
            const docSnap = await getDoc(docRef);
            
            let nuevosVotos = cant;
            if(docSnap.exists()) {
                nuevosVotos = (docSnap.data()[candId] || 0) + cant;
            }
            batch.set(docRef, { [candId]: nuevosVotos }, { merge: true });

            const logRef = doc(collection(db, "logs"));
            batch.set(logRef, {
                fecha: new Date().toLocaleString(),
                username: currentUser.username,
                local: local,
                tipo: tipo,
                candidatoId: candId,
                candidatoNombre: candNombre,
                cantidad: cant,
                activo: true,
                timestamp: new Date()
            });

            await batch.commit();
            mostrarNotificacion("Carga transmitida con éxito", "success");
            qvCantidad.value = "";
        } catch(e) {
            mostrarNotificacion("Error al transmitir datos", "error");
        }
    });
}

window.revertirCargaVoto = async function(logId, tipo, local, candidatoId, cantidad, candidatoNombre) {
    if (!confirm(`¿Está seguro de que desea restar/quitar estos ${cantidad} votos de "${candidatoNombre}" en el local "${local}"? Esta acción quedará registrada en la Auditoría.`)) {
        return;
    }

    try {
        const batch = writeBatch(db);
        const pathRef = tipo === 'intendente' ? `votos_intendentes/${local}` : `votos_concejales/${local}`;
        const docRef = doc(db, pathRef);
        
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
            const data = docSnap.data();
            const votosActuales = data[candidatoId] || 0;
            const nuevosVotos = Math.max(0, votosActuales - cantidad);
            
            batch.update(docRef, { [candidatoId]: nuevosVotos });
        }

        const logRef = doc(db, `logs/${logId}`);
        batch.update(logRef, { activo: false });

        const nuevoLogRef = doc(collection(db, "logs"));
        batch.set(nuevoLogRef, {
            fecha: new Date().toLocaleString(),
            username: currentUser.username + " (ADMIN)",
            local: local,
            tipo: tipo,
            candidatoId: candidatoId,
            candidatoNombre: `[QUIRURGICO - QUITAR VOTOS] ${candidatoNombre}`,
            cantidad: -cantidad,
            activo: true,
            timestamp: new Date()
        });

        await batch.commit();
        mostrarNotificacion("Voto descontado de forma exitosa y registrado en la Auditoría de Carga", "success");
    } catch (error) {
        mostrarNotificacion("No se pudo remover el voto seleccionado", "error");
    }
};

function renderAllLogs() {
    const container = document.getElementById("logsContainer");
    if(!container) return;
    if(cargas.length === 0) {
        container.innerHTML = "<p>No hay transacciones registradas.</p>";
        return;
    }
    container.innerHTML = `
        <table class="vote-table">
            <thead>
                <tr>
                    <th>Fecha/Hora</th>
                    <th>Usuario</th>
                    <th>Local</th>
                    <th>Tipo</th>
                    <th>Opción / Candidato</th>
                    <th>Votos</th>
                    <th>Acción</th>
                </tr>
            </thead>
            <tbody>
                ${cargas.map(log => `
                    <tr>
                        <td>${log.fecha}</td>
                        <td>${log.username || 'Sistema'}</td>
                        <td>${log.local}</td>
                        <td>${log.tipo.toUpperCase()}</td>
                        <td>${log.candidatoNombre}</td>
                        <td class="total-votes">${log.cantidad}</td>
                        <td>
                            ${log.activo !== false && log.cantidad > 0 ? `
                                <button class="logout-btn-revert" onclick="revertirCargaVoto('${log.id}', '${log.tipo}', '${log.local}', '${log.candidatoId}', ${log.cantidad}, '${log.candidatoNombre}')">
                                    <i class="fas fa-trash-alt"></i> Quitar Voto
                                </button>
                            ` : `<span style="color:gray; font-style:italic;">${log.cantidad < 0 ? 'Descuento' : 'Anulado'}</span>`}
                        </td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
}

function renderDigitadorPanel() {
    const digitadorPanel = document.getElementById("digitadorPanel");
    digitadorPanel.innerHTML = `<div class="digitador-container" id="wizardContent"></div>`;
    renderWizardRouter();
}

function renderWizardRouter() {
    const content = document.getElementById("wizardContent");
    if(!content) return;

    if(currentStep === "local") {
        content.innerHTML = `
            <div class="mobile-wizard-container">
                <div class="mobile-wizard-header">
                    <span class="mobile-local-badge"><i class="fas fa-map-marker-alt"></i> Selección de Local</span>
                    <button class="mobile-logout-btn" onclick="window.logoutApp()"><i class="fas fa-sign-out-alt"></i></button>
                </div>
                <div class="wizard-step">
                    <h3 class="wizard-title">Seleccione su Local Asignado</h3>
                    <div class="big-buttons-grid">
                        ${locales.map(l => `<button class="btn-big-option" onclick="window.setLocalWizard('${l}')"><span class="candidate-main-name">${l}</span></button>`).join('')}
                    </div>
                </div>
            </div>
        `;
    } else if(currentStep === "intendente") {
        content.innerHTML = `
            <div class="mobile-wizard-container">
                <div class="mobile-wizard-header">
                    <span class="mobile-local-badge"><i class="fas fa-map-marker-alt"></i> ${selectedLocal}</span>
                    <button class="mobile-logout-btn" onclick="window.logoutApp()"><i class="fas fa-sign-out-alt"></i></button>
                </div>
                <div class="wizard-step">
                    <div class="wizard-progress"><div class="step-dot active"></div><div class="step-dot"></div><div class="step-dot"></div></div>
                    <h3 class="wizard-title">Voto Intendente</h3>
                    <div class="big-buttons-grid">
                        ${intendentes.map(i => `
                            <button class="btn-big-option" onclick="window.setIntendenteWizard('${i.id}')">
                                <span class="candidate-party">${i.partido}</span>
                                <span class="candidate-main-name">${i.nombre}</span>
                            </button>
                        `).join('')}
                    </div>
                    <div style="margin-top:20px;">
                        <button class="btn-back-wizard full-width" onclick="window.regresarPaso('local')"><i class="fas fa-arrow-left"></i> Atrás</button>
                    </div>
                </div>
            </div>
        `;
    } else if(currentStep === "lista") {
        content.innerHTML = `
            <div class="mobile-wizard-container">
                <div class="mobile-wizard-header">
                    <span class="mobile-local-badge"><i class="fas fa-map-marker-alt"></i> ${selectedLocal}</span>
                    <button class="mobile-logout-btn" onclick="window.logoutApp()"><i class="fas fa-sign-out-alt"></i></button>
                </div>
                <div class="wizard-step">
                    <div class="wizard-progress"><div class="step-dot"></div><div class="step-dot active"></div><div class="step-dot"></div></div>
                    <h3 class="wizard-title">Seleccione la Lista de Concejales</h3>
                    <div class="big-buttons-grid">
                        ${Object.keys(listasConcejales).map(k => `
                            <button class="btn-big-option" onclick="window.setListaWizard('${k}')">
                                <span class="candidate-main-name">${listasConcejales[k].nombre}</span>
                            </button>
                        `).join('')}
                    </div>
                    <div style="margin-top:20px;">
                        <button class="btn-back-wizard full-width" onclick="window.regresarPaso('intendente')"><i class="fas fa-arrow-left"></i> Atrás</button>
                    </div>
                </div>
            </div>
        `;
    } else if(currentStep === "nombres") {
        let candidatos = listasConcejales[selectedLista]?.candidatos || [];
        content.innerHTML = `
            <div class="mobile-wizard-container">
                <div class="mobile-wizard-header">
                    <span class="mobile-local-badge"><i class="fas fa-map-marker-alt"></i> ${selectedLocal}</span>
                    <button class="mobile-logout-btn" onclick="window.logoutApp()"><i class="fas fa-sign-out-alt"></i></button>
                </div>
                <div class="wizard-step">
                    <div class="wizard-progress"><div class="step-dot"></div><div class="step-dot"></div><div class="step-dot active"></div></div>
                    <p class="wizard-subtitle">Lista: ${listasConcejales[selectedLista]?.nombre}</p>
                    <h3 class="wizard-title">Seleccione el Candidato a Concejal</h3>
                    <div class="big-buttons-grid">
                        ${candidatos.map(cand => `
                            <button class="btn-big-option" onclick="window.confirmarVotoConcejal('${cand.id}')">
                                <span class="candidate-party">Opción N° ${cand.opcion}</span>
                                <span class="candidate-main-name-small">${cand.nombre}</span>
                            </button>
                        `).join('')}
                    </div>
                    <div style="margin-top:20px;">
                        <button class="btn-back-wizard full-width" onclick="window.regresarPaso('lista')"><i class="fas fa-arrow-left"></i> Atrás</button>
                    </div>
                </div>
            </div>
        `;
    }
}

window.setLocalWizard = function(l) { selectedLocal = l; currentStep = "intendente"; renderWizardRouter(); };
window.setIntendenteWizard = function(id) { selectedIntendente = id; currentStep = "lista"; renderWizardRouter(); };
window.setListaWizard = function(k) { selectedLista = k; currentStep = "nombres"; renderWizardRouter(); };
window.regresarPaso = function(p) { currentStep = p; renderWizardRouter(); };

window.confirmarVotoConcejal = async function(candidatoId) {
    if (!candidatoId || candidatoId === "undefined" || candidatoId === "") {
        mostrarNotificacion("Error: No se permitirá registrar un voto sin un candidato seleccionado para Consejal.", "error");
        return;
    }

    try {
        const batch = writeBatch(db);
        
        const pathInt = `votos_intendentes/${selectedLocal}`;
        const refInt = doc(db, pathInt);
        const snapInt = await getDoc(refInt);
        let vi = 1; if(snapInt.exists()) { vi = (snapInt.data()[selectedIntendente] || 0) + 1; }
        batch.set(refInt, { [selectedIntendente]: vi }, { merge: true });

        const pathConc = `votos_concejales/${selectedLocal}`;
        const refConc = doc(db, pathConc);
        const snapConc = await getDoc(refConc);
        let vc = 1; if(snapConc.exists()) { vc = (snapConc.data()[candidatoId] || 0) + 1; }
        batch.set(refConc, { [candidatoId]: vc }, { merge: true });

        const intNombre = intendentes.find(i=>i.id === selectedIntendente)?.nombre || "";
        const fCand = listasConcejales[selectedLista].candidatos.find(c=>c.id === candidatoId);
        const concNombre = `${listasConcejales[selectedLista].nombre} - ${fCand.nombre}`;

        const logRef1 = doc(collection(db, "logs"));
        batch.set(logRef1, { fecha: new Date().toLocaleString(), username: currentUser.username, local: selectedLocal, tipo: "intendente", candidatoId: selectedIntendente, candidatoNombre: intNombre, cantidad: 1, activo: true, timestamp: new Date() });
        
        const logRef2 = doc(collection(db, "logs"));
        batch.set(logRef2, { fecha: new Date().toLocaleString(), username: currentUser.username, local: selectedLocal, tipo: "concejal", candidatoId: candidatoId, candidatoNombre: concNombre, cantidad: 1, activo: true, timestamp: new Date() });

        await batch.commit();
        
        const overlay = document.createElement("div");
        overlay.className = "wizard-success-overlay";
        overlay.innerHTML = `<div class="success-card"><i class="fas fa-check-circle success-icon"></i><h2>¡Carga Exitosa!</h2><p>Votos transmitidos de forma segura.</p></div>`;
        document.body.appendChild(overlay);
        
        setTimeout(() => {
            overlay.remove();
            currentStep = "intendente";
            selectedIntendente = "";
            selectedLista = "";
            renderWizardRouter();
        }, 1500);

    } catch(e) {
        mostrarNotificacion("Error al procesar la transmisión", "error");
    }
};

window.logoutApp = function() { signOut(auth); };

function escucharDatos() {
    onSnapshot(collection(db, "logs"), (snapshot) => {
        cargas = [];
        snapshot.forEach(doc => {
            cargas.push({ id: doc.id, ...doc.data() });
        });
        cargas.sort((a,b) => b.timestamp?.seconds - a.timestamp?.seconds);
        if(currentUser && currentUser.role === 'admin') {
            renderAllLogs();
        }
    });

    onSnapshot(collection(db, "votos_intendentes"), (snapshot) => {
        votosIntendentes = {};
        snapshot.forEach(doc => { votosIntendentes[doc.id] = doc.data(); });
        if(currentUser && currentUser.role === 'admin') renderCharts();
    });

    onSnapshot(collection(db, "votos_concejales"), (snapshot) => {
        votosConcejales = {};
        snapshot.forEach(doc => { votosConcejales[doc.id] = doc.data(); });
        if(currentUser && currentUser.role === 'admin') renderCharts();
    });
}

function renderCharts() {
    let totalesInt = {}; intendentes.forEach(i => totalesInt[i.id] = 0);
    Object.keys(votosIntendentes).forEach(loc => {
        Object.keys(votosIntendentes[loc]).forEach(id => {
            if(totalesInt[id] !== undefined) totalesInt[id] += votosIntendentes[loc][id];
        });
    });

    let labelsInt = intendentes.map(i=>i.nombre);
    let dataInt = intendentes.map(i=>totalesInt[i.id]);

    const ctxInt = document.getElementById("chartIntendentes")?.getContext("2d");
    if(ctxInt) {
        if(chartInt) chartInt.destroy();
        chartInt = new Chart(ctxInt, {
            type: 'bar',
            data: { labels: labelsInt, datasets: [{ label: 'Votos', data: dataInt, backgroundColor: '#0d523c' }] },
            options: { responsive: true }
        });
    }

    let totalesListas = {}; Object.keys(listasConcejales).forEach(k => totalesListas[k] = 0);
    Object.keys(votosConcejales).forEach(loc => {
        Object.keys(votosConcejales[loc]).forEach(candId => {
            Object.keys(listasConcejales).forEach(k => {
                if(listasConcejales[k].candidatos.some(c=>c.id === candId)) {
                    totalesListas[k] += votosConcejales[loc][candId];
                }
            });
        });
    });

    let labelsList = Object.keys(listasConcejales).map(k=>listasConcejales[k].nombre);
    let dataList = Object.keys(listasConcejales).map(k=>totalesListas[k]);

    const ctxList = document.getElementById("chartConcejales")?.getContext("2d");
    if(ctxList) {
        if(chartList) chartList.destroy();
        chartList = new Chart(ctxList, {
            type: 'pie',
            data: { labels: labelsList, datasets: [{ data: dataList, backgroundColor: ['#0d523c', '#df1660', '#64748b'] }] },
            options: {
                responsive: true,
                plugins: {
                    legend: { position: 'bottom' },
                    datalabels: {
                        formatter: (value, ctx) => {
                            let sum = 0;
                            let dataArr = ctx.chart.data.datasets[0].data;
                            dataArr.map(data => { sum += data; });
                            if(sum === 0) return "0.0%";
                            let percentage = (value * 100 / sum).toFixed(1) + "%";
                            return percentage;
                        },
                        color: '#fff',
                        font: { weight: 'bold', size: 12 }
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                let label = context.label || '';
                                let value = context.raw || 0;
                                let sum = 0;
                                let dataArr = context.chart.data.datasets[0].data;
                                dataArr.map(data => { sum += data; });
                                if(sum === 0) return `${label}: 0.0%`;
                                let percentage = (value * 100 / sum).toFixed(1) + "%";
                                return `${label}: ${percentage}`;
                            }
                        }
                    }
                }
            },
            plugins: [window.ChartDataLabels]
        });
    }
}

function startApp() {
    inyectarEstilosProfesionales();
    const floatingLoginBtn = document.getElementById("floatingLoginBtn");
    
    floatingLoginBtn.addEventListener("click", () => {
        const modal = document.createElement("div");
        modal.className = "login-modal";
        modal.id = "loginModal";
        modal.innerHTML = `
            <div class="login-card">
                <h3>Acceso al Sistema</h3>
                <p>Ingrese credenciales autorizadas</p>
                <input type="text" id="loginUser" placeholder="Usuario">
                <input type="password" id="loginPass" placeholder="Contraseña">
                <button id="btnLogear" style="background:var(--radio-fuchsia);">Ingresar</button>
                <button id="btnCerrarModal" style="background:gray; margin-top:5px;">Cancelar</button>
            </div>
        `;
        document.body.appendChild(modal);

        document.getElementById("btnCerrarModal").addEventListener("click", () => modal.remove());
        document.getElementById("btnLogear").addEventListener("click", async () => {
            const u = document.getElementById("loginUser").value.trim();
            const p = document.getElementById("loginPass").value;
            if(u === "admin" && p === "nasa620admin") {
                currentUser = { uid: "admin", username: "Gilberto", role: "admin" };
                document.getElementById("adminPanel").style.display = "block";
                document.getElementById("digitadorPanel").style.display = "none";
                floatingLoginBtn.style.display = "none";
                modal.remove();
                renderAdminPanel();
                renderCharts();
            } else if(u === "digitador" && p === "santanicarga") {
                currentUser = { uid: "dig1", username: "Digitador_Santaní", role: "digitador" };
                document.getElementById("digitadorPanel").style.display = "block";
                document.getElementById("adminPanel").style.display = "none";
                floatingLoginBtn.style.display = "none";
                modal.remove();
                renderDigitadorPanel();
            } else {
                alert("Credenciales inválidas");
            }
        });
    });

    onAuthStateChanged(auth, (user) => {
        document.getElementById("loadingOverlay").style.display = "none";
    });

    escucharDatos();
}

startApp();
    
