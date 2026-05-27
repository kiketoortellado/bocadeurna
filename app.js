// -------------------- CARGA DE DATOS DESDE CSV --------------------
let locales = ["Gimnasio Municipal", "Colegio Nacional Sebastián de Yegros", "Esc. Carlos Antonio López"];
let intendentes = [];
let listasConcejales = {};
let concejalesIndividuales = [];

let votosIntendentes = {};
let votosConcejales = {};
let users = [];
let cargas = [];
let currentUser = null;

let chartInt, chartList;

// Parsear CSV
function parseCSV(csvText) {
    const lines = csvText.split(/\r?\n/);
    const headers = lines[0].split(',');
    const result = [];
    for (let i = 1; i < lines.length; i++) {
        if (!lines[i].trim()) continue;
        let inQuote = false;
        let current = '';
        const row = [];
        for (let ch of lines[i]) {
            if (ch === '"') inQuote = !inQuote;
            else if (ch === ',' && !inQuote) {
                row.push(current.trim());
                current = '';
            } else current += ch;
        }
        row.push(current.trim());
        if (row.length === headers.length) {
            let obj = {};
            headers.forEach((h, idx) => { obj[h] = row[idx]; });
            result.push(obj);
        }
    }
    return result;
}

async function cargarDatosDesdeCSV() {
    try {
        const response = await fetch('data/elecciones_san_estanislao.csv');
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const csvText = await response.text();
        const data = parseCSV(csvText);
        
        intendentes = [];
        concejalesIndividuales = [];
        listasConcejales = {};
        
        for (let row of data) {
            if (row.Categoria === 'Intendente') {
                intendentes.push({
                    id: row.Lista.toLowerCase().replace(/\s/g, ''),
                    nombre: row.Nombre,
                    lista: row.Lista,
                    alianza: row.Alianza
                });
            } else if (row.Categoria === 'Junta Municipal') {
                const lista = row.Lista;
                const opcion = parseInt(row.Opcion);
                const concejalId = `${lista}_${opcion}`;
                concejalesIndividuales.push({
                    id: concejalId,
                    nombre: row.Nombre,
                    lista: lista,
                    alianza: row.Alianza,
                    opcion: opcion
                });
                if (!listasConcejales[lista]) {
                    listasConcejales[lista] = {
                        nombre: row.Alianza,
                        color: obtenerColorParaLista(lista),
                        candidatos: []
                    };
                }
                listasConcejales[lista].candidatos[opcion-1] = { opcion, nombre: row.Nombre };
            }
        }
        for (let lista in listasConcejales) {
            listasConcejales[lista].candidatos = listasConcejales[lista].candidatos.filter(c => c);
            listasConcejales[lista].candidatos.sort((a,b) => a.opcion - b.opcion);
        }
        
        if (intendentes.length === 0 || concejalesIndividuales.length === 0) {
            throw new Error("No se encontraron datos válidos en el CSV");
        }
        
        document.getElementById('loadingOverlay').style.display = 'none';
        return true;
    } catch (error) {
        document.getElementById('loadingOverlay').innerHTML = `<div style="background:white; padding:2rem; border-radius:1rem; color:red;">Error al cargar CSV: ${error.message}<br><button onclick="location.reload()">Reintentar</button></div>`;
        return false;
    }
}

function obtenerColorParaLista(lista) {
    const colores = {
        '2C': '#c1272d', '2D': '#2c5f8a', '2F': '#1e6f5c', '2L': '#e9c46a',
        '2S': '#e76f51', '2T': '#6d597a', '5': '#b56576', '6': '#f4a261'
    };
    return colores[lista] || '#888888';
}

// -------------------- INICIALIZACIÓN DE VOTOS --------------------
function initVoteStructures() {
    locales.forEach(local => {
        if (!votosIntendentes[local]) votosIntendentes[local] = {};
        intendentes.forEach(i => { if (votosIntendentes[local][i.id] === undefined) votosIntendentes[local][i.id] = 0; });
        
        if (!votosConcejales[local]) votosConcejales[local] = {};
        concejalesIndividuales.forEach(c => { if (votosConcejales[local][c.id] === undefined) votosConcejales[local][c.id] = 0; });
    });
}

function loadPersistentData() {
    const storedInt = localStorage.getItem("santani_votos_intendentes");
    const storedConc = localStorage.getItem("santani_votos_concejales");
    const storedUsers = localStorage.getItem("santani_users");
    const storedCargas = localStorage.getItem("santani_cargas");
    if (storedInt) votosIntendentes = JSON.parse(storedInt);
    if (storedConc) votosConcejales = JSON.parse(storedConc);
    if (storedUsers) users = JSON.parse(storedUsers);
    if (storedCargas) cargas = JSON.parse(storedCargas);
    
    initVoteStructures();
    
    if (!users.find(u => u.username === "Admin")) {
        users.push({ username: "Admin", password: "620rnasa", fullName: "Administrador", localAsignado: null, role: "admin" });
    }
    persistAll();
}

function persistAll() {
    localStorage.setItem("santani_votos_intendentes", JSON.stringify(votosIntendentes));
    localStorage.setItem("santani_votos_concejales", JSON.stringify(votosConcejales));
    localStorage.setItem("santani_users", JSON.stringify(users));
    localStorage.setItem("santani_cargas", JSON.stringify(cargas));
}

function addCarga(usuario, local, tipo, candidatoId, listaId, concejalNombre, votos) {
    cargas.unshift({
        id: Date.now() + Math.random(),
        timestamp: new Date().toISOString(),
        usuario, local, tipo, candidatoId, listaId, concejalNombre, votos
    });
    if (cargas.length > 500) cargas = cargas.slice(0, 500);
    persistAll();
}

function registrarVoto(local, tipo, id, votos, usuario, concejalNombre = null, listaId = null) {
    votos = parseInt(votos);
    if (isNaN(votos) || votos <= 0) return false;
    if (tipo === "intendente") {
        votosIntendentes[local][id] = (votosIntendentes[local][id] || 0) + votos;
        addCarga(usuario, local, "intendente", id, null, null, votos);
    } else if (tipo === "concejal") {
        if (!id || !listaId) return false;
        votosConcejales[local][id] = (votosConcejales[local][id] || 0) + votos;
        addCarga(usuario, local, "concejal", null, listaId, concejalNombre, votos);
    }
    persistAll();
    return true;
}

// -------------------- TOTALIZACIÓN --------------------
function totalIntendentes() {
    let total = {};
    intendentes.forEach(i => total[i.id] = 0);
    locales.forEach(local => {
        intendentes.forEach(i => {
            total[i.id] += votosIntendentes[local][i.id] || 0;
        });
    });
    return total;
}

function totalVotosPorLista() {
    const totales = {};
    Object.keys(listasConcejales).forEach(lid => totales[lid] = 0);
    for (const local in votosConcejales) {
        for (const concejalId in votosConcejales[local]) {
            const listaId = concejalId.split('_')[0];
            if (totales[listaId] !== undefined) {
                totales[listaId] += votosConcejales[local][concejalId];
            }
        }
    }
    return totales;
}

// -------------------- D'HONDT --------------------
function calcularDHondt(votosPorLista, bancas) {
    let listas = Object.keys(votosPorLista).filter(lid => votosPorLista[lid] > 0);
    if (listas.length === 0) return {};
    let cocientes = [];
    for (let lista of listas) {
        for (let i = 1; i <= bancas; i++) {
            cocientes.push({ lista, cociente: votosPorLista[lista] / i });
        }
    }
    cocientes.sort((a,b) => b.cociente - a.cociente);
    let asignacion = {};
    for (let i = 0; i < bancas; i++) {
        if (cocientes[i]) asignacion[cocientes[i].lista] = (asignacion[cocientes[i].lista] || 0) + 1;
    }
    return asignacion;
}

// -------------------- RESULTADOS DE CONCEJALES --------------------
function calcularResultadosConcejales() {
    const votosPorLista = totalVotosPorLista();
    const bancasPorLista = calcularDHondt(votosPorLista, 12);
    
    const votosIndividuales = {};
    for (const concejal of concejalesIndividuales) {
        votosIndividuales[concejal.id] = 0;
        for (const local in votosConcejales) {
            votosIndividuales[concejal.id] += votosConcejales[local][concejal.id] || 0;
        }
    }
    
    const candidatosPorListaOrdenados = {};
    for (const listaId in listasConcejales) {
        candidatosPorListaOrdenados[listaId] = concejalesIndividuales
            .filter(c => c.lista === listaId)
            .map(c => ({ ...c, votos: votosIndividuales[c.id] }))
            .sort((a, b) => b.votos - a.votos);
    }
    
    const electos = [];
    for (const listaId in bancasPorLista) {
        const bancas = bancasPorLista[listaId];
        const candidatosOrdenados = candidatosPorListaOrdenados[listaId];
        for (let i = 0; i < bancas && i < candidatosOrdenados.length; i++) {
            electos.push(candidatosOrdenados[i]);
        }
    }
    electos.sort((a, b) => b.votos - a.votos);
    
    const candidatosPorListaOriginal = {};
    for (const listaId in listasConcejales) {
        candidatosPorListaOriginal[listaId] = listasConcejales[listaId].candidatos.map(c => {
            const concejal = concejalesIndividuales.find(ci => ci.lista === listaId && ci.opcion === c.opcion);
            return {
                opcion: c.opcion,
                nombre: c.nombre,
                votos: concejal ? votosIndividuales[concejal.id] : 0
            };
        });
    }
    
    return { votosPorLista, bancasPorLista, candidatosPorListaOriginal, electos };
}

// -------------------- RENDER ADMIN --------------------
function renderAdminStats() {
    renderTablaIntendentesPorLocal();
    renderTablaListasPorLocal();
    
    const resultados = calcularResultadosConcejales();
    renderDhondt(resultados.votosPorLista, resultados.bancasPorLista);
    renderElectos(resultados.electos);
    renderDetalleConcejales(resultados.candidatosPorListaOriginal);
    renderMiniResumen();
    
    const totalInt = totalIntendentes();
    const totalIntSum = Object.values(totalInt).reduce((a,b)=>a+b,0);
    const ctxInt = document.getElementById('intendentesChart')?.getContext('2d');
    if (ctxInt) {
        if (chartInt) chartInt.destroy();
        chartInt = new Chart(ctxInt, {
            type: 'pie',
            data: {
                labels: intendentes.map(i=>`${i.nombre} (${i.lista})`),
                datasets: [{
                    data: intendentes.map(i=>totalInt[i.id]),
                    backgroundColor: ['#006D5B','#D81B60']
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    datalabels: {
                        backgroundColor: '#ffffffcc',
                        borderRadius: 4,
                        padding: 4,
                        formatter: (value, ctx) => {
                            const percent = totalIntSum ? ((value/totalIntSum)*100).toFixed(1) : 0;
                            return `${percent}%`;
                        },
                        color: '#1a2e2a',
                        font: { weight: 'bold', size: 12 }
                    }
                }
            }
        });
    }
    
    const totalListas = resultados.votosPorLista;
    const totalListasSum = Object.values(totalListas).reduce((a,b)=>a+b,0);
    const ctxList = document.getElementById('listasChart')?.getContext('2d');
    if (ctxList) {
        if (chartList) chartList.destroy();
        const listaIds = Object.keys(listasConcejales);
        chartList = new Chart(ctxList, {
            type: 'bar',
            data: {
                labels: listaIds.map(l => `Lista ${l}`),
                datasets: [{
                    label: 'Votos',
                    data: listaIds.map(l => totalListas[l] || 0),
                    backgroundColor: listaIds.map(l => listasConcejales[l].color),
                    borderRadius: 8
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    datalabels: {
                        anchor: 'end',
                        align: 'top',
                        formatter: (value, ctx) => {
                            const percent = totalListasSum ? ((value/totalListasSum)*100).toFixed(1) : 0;
                            return `${value.toLocaleString()} (${percent}%)`;
                        },
                        color: '#1a2e2a',
                        font: { weight: 'bold', size: 11 }
                    }
                },
                scales: {
                    y: { beginAtZero: true, title: { display: true, text: 'Cantidad de votos' } }
                }
            }
        });
    }
}

function renderMiniResumen() {
    const totalInt = totalIntendentes();
    const totalIntSum = Object.values(totalInt).reduce((a,b)=>a+b,0);
    const resumenInt = document.getElementById("resumenIntendentes");
    if (resumenInt) {
        resumenInt.innerHTML = intendentes.map(i => `<p>${i.nombre}: <strong>${totalInt[i.id].toLocaleString()}</strong> (${totalIntSum ? ((totalInt[i.id]/totalIntSum)*100).toFixed(1) : 0}%)</p>`).join('');
    }
    const totalListas = totalVotosPorLista();
    const totalListasSum = Object.values(totalListas).reduce((a,b)=>a+b,0);
    const resumenConc = document.getElementById("resumenConcejales");
    if (resumenConc) {
        resumenConc.innerHTML = Object.keys(listasConcejales).map(lid => `<p>Lista ${lid}: <strong>${(totalListas[lid]||0).toLocaleString()}</strong> (${totalListasSum ? ((totalListas[lid]/totalListasSum)*100).toFixed(1) : 0}%)</p>`).join('');
    }
}

function renderTablaIntendentesPorLocal() {
    const thead = document.getElementById("intendentesHeader");
    const tbody = document.getElementById("intendentesBody");
    if(!thead) return;
    let header = "<tr><th>Local</th>";
    intendentes.forEach(i=>{ header+=`<th>${i.nombre} (${i.lista})</th>`; });
    header+="<th>Total Local</th></tr>";
    thead.innerHTML = header;
    let body = "";
    locales.forEach(local => {
        let fila = `<tr><td class="candidate-name">${local}</td>`;
        let sumaLocal=0;
        intendentes.forEach(i=>{ let v=votosIntendentes[local][i.id]||0; fila+=`<td>${v.toLocaleString()}</td>`; sumaLocal+=v; });
        fila+=`<td class="total-votes">${sumaLocal.toLocaleString()}</td></tr>`;
        body+=fila;
    });
    const totalG = totalIntendentes();
    let filaTotal = `<tr style="background:#f7ede3; font-weight:bold;"><td>TOTAL GENERAL</td>`;
    intendentes.forEach(i=>{ filaTotal+=`<td>${totalG[i.id].toLocaleString()}</td>`; });
    filaTotal+=`<td>${(Object.values(totalG).reduce((a,b)=>a+b,0)).toLocaleString()}</td></tr>`;
    tbody.innerHTML = body;
}

function renderTablaListasPorLocal() {
    const thead = document.getElementById("listasHeader");
    const tbody = document.getElementById("listasBody");
    if(!thead) return;
    let header = "<tr><th>Local</th>";
    Object.keys(listasConcejales).forEach(lid=>{ header+=`<th>Lista ${lid}<br><small>${listasConcejales[lid].nombre}</small></th>`; });
    header+="<th>Total Local</th></tr>";
    thead.innerHTML = header;
    let body="";
    locales.forEach(local=>{
        let fila=`<tr><td class="candidate-name">${local}</td>`;
        let sumaLocal=0;
        const votosLocal = {};
        Object.keys(listasConcejales).forEach(lid=> votosLocal[lid]=0);
        for (const concejalId in votosConcejales[local]) {
            const listaId = concejalId.split('_')[0];
            votosLocal[listaId] += votosConcejales[local][concejalId];
        }
        Object.keys(listasConcejales).forEach(lid=>{
            let v=votosLocal[lid]||0;
            fila+=`<td>${v.toLocaleString()}</td>`;
            sumaLocal+=v;
        });
        fila+=`<td class="total-votes">${sumaLocal.toLocaleString()}</td></tr>`;
        body+=fila;
    });
    const totalL = totalVotosPorLista();
    let sumaTotal=0;
    let filaTotal="<tr style='background:#f7ede3;font-weight:bold;'><td>TOTAL GENERAL</td>";
    Object.keys(listasConcejales).forEach(lid=>{ let v=totalL[lid]; filaTotal+=`<td>${v.toLocaleString()}</td>`; sumaTotal+=v; });
    filaTotal+=`<td>${sumaTotal.toLocaleString()}</td></tr>`;
    tbody.innerHTML = body;
}

function renderDhondt(votosPorLista, bancasPorLista) {
    const container = document.getElementById("dhondtResultado");
    if (!container) return;
    let html = `<table class="vote-table"><thead><tr><th>Lista</th><th>Votos totales de la lista</th><th>Bancas asignadas</th><tr></thead><tbody>`;
    const listasOrdenadas = Object.keys(votosPorLista).sort((a,b)=>votosPorLista[b]-votosPorLista[a]);
    for (let lid of listasOrdenadas) {
        html += `<tr>
            <td><strong>Lista ${lid}</strong><br><small>${listasConcejales[lid].nombre}</small></td>
            <td>${votosPorLista[lid].toLocaleString()}</td>
            <td style="font-weight:bold;">${bancasPorLista[lid]||0}</td>
        </tr>`;
    }
    html += `</tbody></table>`;
    container.innerHTML = html;
}

function renderElectos(electos) {
    const electosBody = document.getElementById("electosBody");
    if (electosBody) {
        electosBody.innerHTML = electos.map((c, idx) => `
            <tr>
                <td>${idx+1}°</td><td>Lista ${c.lista}</td><td>${c.nombre}</td><td>${c.votos.toLocaleString()}</td>
            </tr>
        `).join('');
    }
}

function renderDetalleConcejales(candidatosPorListaOriginal) {
    const container = document.getElementById("concejalesDetalle");
    if (!container) return;
    let html = `<div style="display:flex; flex-wrap:wrap; gap:1rem;">`;
    for (const [lid, candidatos] of Object.entries(candidatosPorListaOriginal)) {
        const listaInfo = listasConcejales[lid];
        html += `<div style="flex:1; min-width:240px; background:#fef9ef; border-radius:1rem; padding:1rem; border-left:6px solid ${listaInfo.color};">
            <h4>Lista ${lid} – ${listaInfo.nombre}</h4>
            <p><strong>Total votos lista:</strong> ${candidatos.reduce((sum,c)=>sum+c.votos,0).toLocaleString()}</p>
            <table class="detalle-sin-bordes">
                <thead><tr><th>N°</th><th>Candidato</th><th>Votos</th></tr></thead>
                <tbody>`;
        candidatos.forEach(c => {
            html += `<tr><td>${c.opcion}</td><td>${c.nombre}</td><td style="text-align:right;">${c.votos.toLocaleString()}</td></tr>`;
        });
        html += `</tbody></table></div>`;
    }
    html += `</div>`;
    container.innerHTML = html;
}

// -------------------- GESTIÓN DE USUARIOS Y LOGS --------------------
function renderUsersTable() {
    const tbody = document.getElementById("usersTableBody");
    if(!tbody) return;
    tbody.innerHTML = users.filter(u=>u.role !== "admin").map(u => `
        <tr>
            <td>${u.fullName}</td><td>${u.username}</td><td>${u.localAsignado}</td>
            <td>
                <button class="edit-password-btn" data-user="${u.username}" style="background:#f4a261;">Cambiar contraseña</button>
                <button class="delete-user-btn" data-user="${u.username}" style="background:#b0154f;">Eliminar</button>
            </td>
        </tr>
    `).join("");
    document.querySelectorAll('.edit-password-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const username = btn.getAttribute('data-user');
            const newPass = prompt("Nueva contraseña para " + username);
            if (newPass && newPass.trim()) {
                const user = users.find(u => u.username === username);
                if (user) { user.password = newPass.trim(); persistAll(); alert("Contraseña actualizada"); renderUsersTable(); }
            }
        });
    });
    document.querySelectorAll('.delete-user-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const username = btn.getAttribute('data-user');
            if(confirm(`¿Eliminar usuario ${username}?`)) {
                users = users.filter(u => u.username !== username);
                persistAll();
                renderUsersTable();
            }
        });
    });
}

function renderAllLogs() {
    const tbody = document.getElementById("allLogsBody");
    if(!tbody) return;
    tbody.innerHTML = cargas.slice(0,200).map(c => `
        <tr>
            <td>${new Date(c.timestamp).toLocaleString()}</td><td>${c.usuario}</td><td>${c.local}</td>
            <td>${c.tipo === "intendente" ? "Intendente" : "Concejal"}</td>
            <td>${c.candidatoId ? (intendentes.find(i=>i.id===c.candidatoId)?.nombre || c.candidatoId) : (c.listaId ? `Lista ${c.listaId}` : '')}</td>
            <td>${c.concejalNombre || '-'}</td><td>${c.votos}</td>
        </tr>
    `).join("");
}

// -------------------- DIGITADOR --------------------
function loadDigitadorInterface() {
    document.getElementById("digitadorPanel").style.display = "block";
    document.getElementById("adminPanel").style.display = "none";
    document.getElementById("miLocalSpan").innerText = currentUser.localAsignado;
    const listaSelect = document.getElementById("digListaSelect");
    listaSelect.innerHTML = '<option value="">Seleccione una lista</option>';
    for (const [lid, info] of Object.entries(listasConcejales)) {
        listaSelect.innerHTML += `<option value="${lid}">Lista ${lid} - ${info.nombre}</option>`;
    }
    listaSelect.onchange = function() {
        const concejalSelect = document.getElementById("digConcejalSelect");
        if (this.value) {
            const candidatos = listasConcejales[this.value].candidatos;
            concejalSelect.disabled = false;
            concejalSelect.innerHTML = '<option value="">Seleccione concejal</option>' + candidatos.map(c => `<option value="${c.opcion} — ${c.nombre}">${c.opcion} — ${c.nombre}</option>`).join('');
        } else {
            concejalSelect.disabled = true;
            concejalSelect.innerHTML = '<option value="">Primero elija lista</option>';
        }
    };
    renderMisCargas();
}

function renderMisCargas() {
    const tbody = document.getElementById("misCargasBody");
    if(!tbody) return;
    const misCargas = cargas.filter(c => c.usuario === currentUser.username).slice(0,30);
    tbody.innerHTML = misCargas.map(c => `
        <tr>
            <td>${new Date(c.timestamp).toLocaleString()}</td>
            <td>${c.tipo === "intendente" ? "Intendente" : "Concejal"}</td>
            <td>${c.tipo === "intendente" ? (intendentes.find(i=>i.id===c.candidatoId)?.nombre || c.candidatoId) : (c.concejalNombre || `Lista ${c.listaId}`)}</td>
            <td>${c.votos}</td>
        </tr>
    `).join("");
}

// -------------------- LOGIN CON LOGO --------------------
function showLoginModal() {
    const modal = document.createElement('div');
    modal.className = 'login-modal';
    modal.innerHTML = `
        <div class="login-card">
            <img src="assets/logo_nasa.png" alt="Logo Radio Ñasaindy" class="logo-radio login-logo">
            <h3>Radio Ñasaindy 620AM</h3>
            <p>Sistema de Carga de Votos - San Estanislao</p>
            <input type="text" id="loginUser" placeholder="Usuario">
            <input type="password" id="loginPass" placeholder="Contraseña">
            <button id="loginBtn">Ingresar</button>
            <button id="closeModalBtn">Cancelar</button>
        </div>
    `;
    document.body.appendChild(modal);
    const login = () => {
        const user = document.getElementById('loginUser').value;
        const pass = document.getElementById('loginPass').value;
        const found = users.find(u => u.username === user && u.password === pass);
        if (found) {
            currentUser = found;
            modal.remove();
            if (found.role === "admin") {
                document.getElementById("adminPanel").style.display = "block";
                document.getElementById("digitadorPanel").style.display = "none";
                document.getElementById("floatingLoginBtn").style.display = "none";
                renderAdminStats();
                renderUsersTable();
                renderAllLogs();
                // Configurar selects admin
                const adminLocal = document.getElementById("adminLocalSelect");
                adminLocal.innerHTML = locales.map(l => `<option value="${l}">${l}</option>`).join('');
                const adminTipo = document.getElementById("adminTipoSelect");
                const adminCandidato = document.getElementById("adminCandidatoSelect");
                function actualizarAdminSelect() {
                    if (adminTipo.value === "intendente") {
                        adminCandidato.innerHTML = intendentes.map(i => `<option value="${i.id}">${i.nombre} (${i.lista})</option>`).join('');
                    } else {
                        let html = '';
                        for (const [lid, info] of Object.entries(listasConcejales)) {
                            for (let candidato of info.candidatos) {
                                const concejalObj = concejalesIndividuales.find(c => c.lista === lid && c.opcion === candidato.opcion);
                                if (concejalObj) {
                                    html += `<option value="${concejalObj.id}" data-lista="${lid}">Lista ${lid} - ${candidato.opcion} — ${candidato.nombre}</option>`;
                                }
                            }
                        }
                        adminCandidato.innerHTML = html;
                    }
                }
                adminTipo.addEventListener('change', actualizarAdminSelect);
                actualizarAdminSelect();
                document.getElementById("adminRegistrarBtn").onclick = () => {
                    const local = adminLocal.value;
                    const tipo = adminTipo.value;
                    const votos = parseInt(document.getElementById("adminVotosInput").value);
                    if (isNaN(votos) || votos <= 0) { alert("Cantidad inválida"); return; }
                    if (tipo === "intendente") {
                        const id = adminCandidato.value;
                        if (registrarVoto(local, "intendente", id, votos, "Admin")) {
                            alert("Voto registrado"); renderAdminStats(); renderAllLogs();
                        } else alert("Error");
                    } else {
                        const selected = adminCandidato.options[adminCandidato.selectedIndex];
                        const concejalId = selected.value;
                        const listaId = selected.getAttribute("data-lista");
                        const concejalNombre = selected.text.split(' - ')[1];
                        if (registrarVoto(local, "concejal", concejalId, votos, "Admin", concejalNombre, listaId)) {
                            alert("Voto registrado"); renderAdminStats(); renderAllLogs();
                        } else alert("Error");
                    }
                    document.getElementById("adminVotosInput").value = "";
                };
                // Tabs
                document.querySelectorAll('.tab-btn').forEach(btn => {
                    btn.addEventListener('click', () => {
                        document.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active'));
                        btn.classList.add('active');
                        document.querySelectorAll('.tab-content').forEach(t=>t.classList.remove('active'));
                        document.getElementById('tab'+btn.getAttribute('data-tab').charAt(0).toUpperCase()+btn.getAttribute('data-tab').slice(1)).classList.add('active');
                        if(btn.getAttribute('data-tab')==='logs') renderAllLogs();
                        if(btn.getAttribute('data-tab')==='users') renderUsersTable();
                        if(btn.getAttribute('data-tab')==='stats') renderAdminStats();
                    });
                });
            } else {
                document.getElementById("digitadorPanel").style.display = "block";
                document.getElementById("adminPanel").style.display = "none";
                document.getElementById("floatingLoginBtn").style.display = "none";
                loadDigitadorInterface();
            }
        } else {
            alert("Usuario o contraseña incorrectos");
        }
    };
    document.getElementById('loginBtn').addEventListener('click', login);
    document.getElementById('closeModalBtn').addEventListener('click', () => modal.remove());
    document.getElementById('loginPass').addEventListener('keypress', (e) => { if (e.key === 'Enter') login(); });
}

function logout() {
    currentUser = null;
    document.getElementById("adminPanel").style.display = "none";
    document.getElementById("digitadorPanel").style.display = "none";
    document.getElementById("floatingLoginBtn").style.display = "block";
}

// -------------------- EVENTOS Y ARRANQUE --------------------
async function startApp() {
    const success = await cargarDatosDesdeCSV();
    if (!success) return;
    loadPersistentData();

    // Service Worker desactivado para evitar error 404
    // if ('serviceWorker' in navigator) {
    //     navigator.serviceWorker.register('/sw.js')
    //         .then(reg => console.log('Service Worker registrado', reg))
    //         .catch(err => console.error('Error al registrar SW:', err));
    // }

    document.getElementById("newUserLocal").innerHTML = locales.map(l => `<option value="${l}">${l}</option>`).join('');
    document.getElementById("digIntendenteSelect").innerHTML = intendentes.map(i => `<option value="${i.id}">${i.nombre} (${i.lista})</option>`).join('');
    
    document.getElementById('floatingLoginBtn').addEventListener('click', showLoginModal);
    document.getElementById('logoutAdminBtn')?.addEventListener('click', logout);
    document.getElementById('logoutDigitadorBtn')?.addEventListener('click', logout);
    
    document.getElementById('cargarIntendenteBtn')?.addEventListener('click', () => {
        if(!currentUser || currentUser.role !== 'digitador') return;
        const id = document.getElementById('digIntendenteSelect').value;
        const votos = parseInt(document.getElementById('digVotosIntendente').value);
        if (votos > 0 && registrarVoto(currentUser.localAsignado, "intendente", id, votos, currentUser.username)) {
            alert(`Voto intendente registrado: +${votos}`);
            document.getElementById('digVotosIntendente').value = '';
            renderMisCargas();
        } else alert("Cantidad inválida");
    });
    
    document.getElementById('cargarConcejalBtn')?.addEventListener('click', () => {
        if(!currentUser || currentUser.role !== 'digitador') return;
        const listaId = document.getElementById('digListaSelect').value;
        const concejalTexto = document.getElementById('digConcejalSelect').value;
        if (!listaId || !concejalTexto) { alert("Seleccione lista y concejal"); return; }
        const concejalObj = concejalesIndividuales.find(c => c.lista === listaId && `${c.opcion} — ${c.nombre}` === concejalTexto);
        if (!concejalObj) { alert("Error al identificar concejal"); return; }
        const votos = parseInt(document.getElementById('digVotosConcejal').value);
        if (votos <= 0) { alert("Cantidad inválida"); return; }
        if (registrarVoto(currentUser.localAsignado, "concejal", concejalObj.id, votos, currentUser.username, concejalObj.nombre, listaId)) {
            alert(`Voto a concejal registrado: +${votos} para ${concejalObj.nombre}`);
            document.getElementById('digVotosConcejal').value = '';
            renderMisCargas();
        } else alert("Error al registrar");
    });
    
    document.getElementById('createUserBtn')?.addEventListener('click', () => {
        if (currentUser?.role !== 'admin') return;
        const fullName = document.getElementById('newFullName').value.trim();
        const username = document.getElementById('newUsername').value.trim();
        const password = document.getElementById('newPassword').value.trim();
        const local = document.getElementById('newUserLocal').value;
        if (!fullName || !username || !password) { alert("Complete todos los campos"); return; }
        if (users.find(u=>u.username===username)) { alert("El usuario ya existe"); return; }
        users.push({ fullName, username, password, localAsignado: local, role: "digitador" });
        persistAll();
        renderUsersTable();
        document.getElementById('newFullName').value = '';
        document.getElementById('newUsername').value = '';
        document.getElementById('newPassword').value = '';
        alert("Usuario digitador creado");
    });
}

startApp();
