// -------------------- CARGA DE DATOS DESDE CSV (LISTA DESBLOQUEADA) --------------------
let locales = ["Gimnasio Municipal", "Colegio Nacional Sebastián de Yegros", "Esc. Carlos Antonio López"];
let intendentes = [];          // { id, nombre, lista, alianza }
let concejales = [];           // { id, nombre, lista, alianza, numeroLista, orden }
let listasInfo = {};           // { "2F": { nombre, color, candidatosIds: [] } }

let votosIntendentes = {};     // votosIntendentes[local][candidatoId]
let votosConcejales = {};      // votosConcejales[local][candidatoId]

let users = [];
let cargas = [];
let currentUser = null;

let dataLoaded = false;
let chartInt, chartList; // chartList será de votos por lista (suma de sus concejales)

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
        concejales = [];
        listasInfo = {};
        
        for (let row of data) {
            if (row.Categoria === 'Intendente') {
                intendentes.push({
                    id: row.Lista.toLowerCase().replace(/\s/g, '') + '_int',
                    nombre: row.Nombre,
                    lista: row.Lista,
                    alianza: row.Alianza
                });
            } else if (row.Categoria === 'Junta Municipal') {
                const candidatoId = `${row.Lista}_${row.Opcion}`;
                concejales.push({
                    id: candidatoId,
                    nombre: row.Nombre,
                    lista: row.Lista,
                    alianza: row.Alianza,
                    numeroLista: row.Lista,
                    orden: parseInt(row.Opcion)
                });
                if (!listasInfo[row.Lista]) {
                    listasInfo[row.Lista] = {
                        nombre: row.Alianza,
                        color: obtenerColorParaLista(row.Lista),
                        candidatosIds: []
                    };
                }
                listasInfo[row.Lista].candidatosIds.push(candidatoId);
            }
        }
        
        // Ordenar los candidatos de cada lista por orden (Opcion) para mostrar listado original
        for (let lista in listasInfo) {
            listasInfo[lista].candidatosIds.sort((a,b) => {
                const aId = a.split('_')[1];
                const bId = b.split('_')[1];
                return parseInt(aId) - parseInt(bId);
            });
        }
        
        if (intendentes.length === 0 || concejales.length === 0) {
            throw new Error("No se encontraron datos válidos en el CSV");
        }
        
        dataLoaded = true;
        document.getElementById('loadingOverlay').style.display = 'none';
        return true;
    } catch (error) {
        console.error(error);
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
        concejales.forEach(c => { if (votosConcejales[local][c.id] === undefined) votosConcejales[local][c.id] = 0; });
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

function addCarga(usuario, local, tipo, candidatoId, nombreCandidato, votos) {
    cargas.unshift({
        id: Date.now() + Math.random(),
        timestamp: new Date().toISOString(),
        usuario, local, tipo, candidatoId, nombreCandidato, votos
    });
    if (cargas.length > 500) cargas = cargas.slice(0, 500);
    persistAll();
}

function registrarVoto(local, tipo, candidatoId, votos, usuario) {
    votos = parseInt(votos);
    if (isNaN(votos) || votos <= 0) return false;
    if (tipo === "intendente") {
        votosIntendentes[local][candidatoId] = (votosIntendentes[local][candidatoId] || 0) + votos;
        const candidato = intendentes.find(i => i.id === candidatoId);
        addCarga(usuario, local, "intendente", candidatoId, candidato?.nombre || candidatoId, votos);
    } else if (tipo === "concejal") {
        votosConcejales[local][candidatoId] = (votosConcejales[local][candidatoId] || 0) + votos;
        const candidato = concejales.find(c => c.id === candidatoId);
        addCarga(usuario, local, "concejal", candidatoId, candidato?.nombre || candidatoId, votos);
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

// Para lista desbloqueada: total de votos por lista = suma de votos de todos sus concejales
function totalVotosPorLista() {
    let total = {};
    Object.keys(listasInfo).forEach(lid => total[lid] = 0);
    locales.forEach(local => {
        concejales.forEach(c => {
            total[c.lista] += votosConcejales[local][c.id] || 0;
        });
    });
    return total;
}

// Votos individuales por concejal (totales acumulados)
function totalVotosConcejal() {
    let total = {};
    concejales.forEach(c => total[c.id] = 0);
    locales.forEach(local => {
        concejales.forEach(c => {
            total[c.id] += votosConcejales[local][c.id] || 0;
        });
    });
    return total;
}

// -------------------- D'HONDT (sobre votos por lista) --------------------
function calcularDhondt(votosPorLista, bancas) {
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

function obtenerConcejalesElectos() {
    const totalPorLista = totalVotosPorLista();
    const bancas = 12;
    const dhondt = calcularDhondt(totalPorLista, bancas);
    const votosPorConcejal = totalVotosConcejal();
    
    // Para cada lista con bancas, ordenar sus candidatos por votos individuales (descendente)
    let electos = [];
    for (let lista of Object.keys(dhondt)) {
        const bancasLista = dhondt[lista];
        if (bancasLista > 0) {
            // Obtener candidatos de esta lista con sus votos totales
            const candidatosLista = listasInfo[lista].candidatosIds.map(cid => ({
                id: cid,
                nombre: concejales.find(c => c.id === cid).nombre,
                votos: votosPorConcejal[cid] || 0
            }));
            candidatosLista.sort((a,b) => b.votos - a.votos);
            const electosLista = candidatosLista.slice(0, bancasLista);
            electos.push(...electosLista);
        }
    }
    // Ordenar los electos por votos totales (opcional)
    electos.sort((a,b) => b.votos - a.votos);
    return { dhondt, electos };
}

function renderDhondt() {
    const totalPorLista = totalVotosPorLista();
    const { dhondt, electos } = obtenerConcejalesElectos();
    const bancas = 12;
    let html = `<div style="background:#f4f1ea; border-radius:1rem; padding:1rem;">
        <h4>Distribución de ${bancas} bancas (Lista Desbloqueada - Voto Preferencial)</h4>
        <p><small>Las bancas se asignan por lista según suma de votos de sus candidatos (D'Hondt). Luego, dentro de cada lista, los candidatos más votados ocupan las bancas.</small></p>
        <table class="vote-table"><thead><tr><th>Lista</th><th>Votos totales lista</th><th>Bancas asignadas</th><th>Concejales electos (por orden de votos individuales)</th></tr></thead><tbody>`;
    const listasOrdenadas = Object.keys(listasInfo).sort((a,b)=> (dhondt[b]||0) - (dhondt[a]||0));
    for (let lid of listasOrdenadas) {
        const votosLista = totalPorLista[lid] || 0;
        const bancasAsig = dhondt[lid] || 0;
        const listaInfo = listasInfo[lid];
        // Obtener candidatos electos de esta lista
        const candidatosLista = electos.filter(e => concejales.find(c => c.id === e.id)?.lista === lid);
        const electosNombres = candidatosLista.map(e => e.nombre).join(", ");
        html += `<tr>
            <td><strong>Lista ${lid}</strong><br><small>${listaInfo.nombre}</small></td>
            <td>${votosLista.toLocaleString()}</td>
            <td style="font-size:1.2rem; font-weight:bold;">${bancasAsig}</td>
            <td>${electosNombres || "—"}</td>
        </tr>`;
    }
    html += `</tbody></table></div>`;
    document.getElementById("dhondtResultado").innerHTML = html;
}

// -------------------- RENDER ADMIN --------------------
function renderAdminStats() {
    renderTablaIntendentesPorLocal();
    renderTablaConcejalesPorLocal();
    renderDetalleConcejales();
    renderDhondt();
    renderGraficos();
}

function renderGraficos() {
    const totalInt = totalIntendentes();
    const ctxInt = document.getElementById('intendentesChart')?.getContext('2d');
    if (ctxInt) {
        if (chartInt) chartInt.destroy();
        chartInt = new Chart(ctxInt, {
            type: 'bar',
            data: {
                labels: intendentes.map(i=>`${i.nombre} (${i.lista})`),
                datasets: [{ label: 'Votos totales', data: intendentes.map(i=>totalInt[i.id]), backgroundColor: ['#006D5B','#D81B60'] }]
            },
            options: { responsive: true, scales: { y: { beginAtZero: true } } }
        });
    }
    const totalPorLista = totalVotosPorLista();
    const ctxList = document.getElementById('listasChart')?.getContext('2d');
    if (ctxList) {
        if (chartList) chartList.destroy();
        chartList = new Chart(ctxList, {
            type: 'pie',
            data: {
                labels: Object.keys(listasInfo).map(l=>`Lista ${l}`),
                datasets: [{ data: Object.keys(listasInfo).map(l=>totalPorLista[l]), backgroundColor: Object.values(listasInfo).map(l=>l.color) }]
            },
            options: { responsive: true }
        });
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
    body+=filaTotal;
    tbody.innerHTML = body;
}

function renderTablaConcejalesPorLocal() {
    const thead = document.getElementById("listasHeader");
    const tbody = document.getElementById("listasBody");
    if(!thead) return;
    let header = "<tr><th>Local</th>";
    Object.keys(listasInfo).forEach(lid=>{ header+=`<th>Lista ${lid}<br><small>${listasInfo[lid].nombre}</small></th>`; });
    header+="<th>Total Local</th></tr>";
    thead.innerHTML = header;
    let body = "";
    locales.forEach(local => {
        let fila = `<tr><td class="candidate-name">${local}</td>`;
        let sumaLocal = 0;
        Object.keys(listasInfo).forEach(lid => {
            let votosListaEnLocal = 0;
            concejales.filter(c => c.lista === lid).forEach(c => {
                votosListaEnLocal += votosConcejales[local][c.id] || 0;
            });
            fila += `<td class="vote-number">${votosListaEnLocal.toLocaleString()}</td>`;
            sumaLocal += votosListaEnLocal;
        });
        fila += `<td class="total-votes">${sumaLocal.toLocaleString()}</td></tr>`;
        body += fila;
    });
    // Totales generales
    const totalPorLista = totalVotosPorLista();
    let sumaTotal = 0;
    let filaTotal = "<tr style='background:#f7ede3;font-weight:bold;'><td>TOTAL GENERAL</td>";
    Object.keys(listasInfo).forEach(lid => {
        let v = totalPorLista[lid];
        filaTotal += `<td>${v.toLocaleString()}</td>`;
        sumaTotal += v;
    });
    filaTotal += `<td>${sumaTotal.toLocaleString()}</td></tr>`;
    body += filaTotal;
    tbody.innerHTML = body;
}

function renderDetalleConcejales() {
    const container = document.getElementById("concejalesDetalle");
    if(!container) return;
    const votosPorConcejal = totalVotosConcejal();
    let html = `<div style="display:flex; flex-wrap:wrap; gap:1rem;">`;
    for (const [lid, info] of Object.entries(listasInfo)) {
        const totalLista = totalVotosPorLista()[lid] || 0;
        html += `<div style="flex:1; min-width:280px; background:#fef9ef; border-radius:1rem; padding:1rem; border-left:6px solid ${info.color};">
            <h4>Lista ${lid} – ${info.nombre}</h4>
            <p><strong>Total votos lista:</strong> ${totalLista.toLocaleString()}</p>
            <table style="width:100%; font-size:0.75rem; margin-top:0.5rem; border-collapse:collapse;">
                <tr style="background:#e0d6c8;"><th>#</th><th>Candidato</th><th>Votos</th></tr>`;
        const candidatosLista = info.candidatosIds.map(cid => {
            const c = concejales.find(c => c.id === cid);
            return { orden: c.orden, nombre: c.nombre, votos: votosPorConcejal[cid] || 0 };
        }).sort((a,b) => a.orden - b.orden);
        candidatosLista.forEach(c => {
            html += `<tr><td style="padding:0.2rem;">${c.orden}</td><td>${c.nombre}</td><td style="text-align:right;">${c.votos.toLocaleString()}</td></tr>`;
        });
        html += `</table></div>`;
    }
    html += `</div>`;
    container.innerHTML = html;
}

// -------------------- GESTIÓN DE USUARIOS (igual, solo cambian nombres) --------------------
function renderUsersTable() {
    const tbody = document.getElementById("usersTableBody");
    if(!tbody) return;
    tbody.innerHTML = users.filter(u=>u.role !== "admin").map(u => `
        <tr>
            <td>${u.fullName}</td>
            <td>${u.username}</td>
            <td>${u.localAsignado}</td>
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
            <td>${new Date(c.timestamp).toLocaleString()}</td>
            <td>${c.usuario}</td>
            <td>${c.local}</td>
            <td>${c.tipo === "intendente" ? "Intendente" : "Concejal"}</td>
            <td>${c.nombreCandidato || c.candidatoId}</td>
            <td>${c.votos}</td>
        </tr>
    `).join("");
}

// -------------------- DIGITADOR (carga por candidato individual) --------------------
function loadDigitadorInterface() {
    document.getElementById("digitadorPanel").style.display = "block";
    document.getElementById("adminPanel").style.display = "none";
    document.getElementById("miLocalSpan").innerText = currentUser.localAsignado;
    // Llenar select de concejales agrupados por lista
    const listaSelect = document.getElementById("digListaSelect");
    listaSelect.innerHTML = '<option value="">Seleccione una lista</option>';
    for (const [lid, info] of Object.entries(listasInfo)) {
        listaSelect.innerHTML += `<option value="${lid}">Lista ${lid} - ${info.nombre}</option>`;
    }
    listaSelect.onchange = function() {
        const concejalSelect = document.getElementById("digConcejalSelect");
        if (this.value) {
            const listaId = this.value;
            const candidatosLista = listasInfo[listaId].candidatosIds.map(cid => {
                const c = concejales.find(c => c.id === cid);
                return { id: c.id, nombre: c.nombre };
            }).sort((a,b) => {
                const aOrd = parseInt(a.id.split('_')[1]);
                const bOrd = parseInt(b.id.split('_')[1]);
                return aOrd - bOrd;
            });
            concejalSelect.disabled = false;
            concejalSelect.innerHTML = '<option value="">Seleccione concejal</option>' + candidatosLista.map(c => `<option value="${c.id}">${c.nombre}</option>`).join('');
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
            <td>${c.nombreCandidato}</td>
            <td>${c.votos}</td>
        </tr>
    `).join("");
}

// -------------------- LOGIN --------------------
function showLoginModal() {
    const modal = document.createElement('div');
    modal.className = 'login-modal';
    modal.innerHTML = `
        <div class="login-card">
            <i class="fas fa-microphone-alt"></i>
            <h3>Radio Ñasaindy 620AM</h3>
            <p>Sistema de Voto Preferencial (Lista Desbloqueada)</p>
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
                // Preparar selects admin
                const adminLocal = document.getElementById("adminLocalSelect");
                adminLocal.innerHTML = locales.map(l => `<option value="${l}">${l}</option>`).join('');
                const adminTipo = document.getElementById("adminTipoSelect");
                const adminCandidato = document.getElementById("adminCandidatoSelect");
                function actualizarAdminSelect() {
                    if (adminTipo.value === "intendente") {
                        adminCandidato.innerHTML = intendentes.map(i => `<option value="${i.id}">${i.nombre} (${i.lista})</option>`).join('');
                    } else {
                        let html = '';
                        for (const [lid, info] of Object.entries(listasInfo)) {
                            const candidatosLista = listasInfo[lid].candidatosIds.map(cid => {
                                const c = concejales.find(c => c.id === cid);
                                return { id: c.id, nombre: c.nombre };
                            }).sort((a,b) => {
                                const aOrd = parseInt(a.id.split('_')[1]);
                                const bOrd = parseInt(b.id.split('_')[1]);
                                return aOrd - bOrd;
                            });
                            for (let c of candidatosLista) {
                                html += `<option value="${c.id}" data-lista="${lid}">Lista ${lid} - ${c.nombre}</option>`;
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
                    const candidatoId = adminCandidato.value;
                    const votos = parseInt(document.getElementById("adminVotosInput").value);
                    if (isNaN(votos) || votos <= 0) { alert("Cantidad inválida"); return; }
                    if (registrarVoto(local, tipo, candidatoId, votos, "Admin")) {
                        alert("Voto registrado"); renderAdminStats(); renderAllLogs();
                    } else alert("Error");
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
    // Llenar selects estáticos
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
        const candidatoId = document.getElementById('digConcejalSelect').value;
        const votos = parseInt(document.getElementById('digVotosConcejal').value);
        if (!candidatoId || votos<=0) { alert("Seleccione concejal y cantidad válida"); return; }
        if (registrarVoto(currentUser.localAsignado, "concejal", candidatoId, votos, currentUser.username)) {
            alert(`Voto concejal registrado: +${votos}`);
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
