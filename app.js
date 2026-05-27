// -------------------- DATOS DEL DISTRITO SANTANÍ --------------------
const locales = ["Gimnasio Municipal", "Colegio Nacional Sebastián de Yegros", "Esc. Carlos Antonio López"];
const intendentes = [
    { id: "carlos_veron", nombre: "Ing. Carlitos Verón", lista: "2C" },
    { id: "christian_decc", nombre: "Christian D'Ecclesiis", lista: "2D" }
];
const listasConcejales = {
    "2F": { nombre: "Honor Colorado F", color: "#1e6f5c", candidatos: ["1 — Lucas Guillen","2 — Adan Rojas","3 — Luci Barreto","4 — Enrique Martinez","5 — Hugo Acosta","6 — Cristhian Acosta","7 — Cristhian D'Ecclesiis","8 — Prof. Abog. Daniel Martinez","9 — Nelson Zarza","10 — Carmen Cuenca","11 — Jorge Carracela","12 — Rodrigo Benitez"] },
    "2L": { nombre: "Honor Colorado L", color: "#e9c46a", candidatos: ["1 — Prof. Lourdes Meza","2 — Hilda Martinez","3 — Liliana Candia","4 — Brisa Asimo","5 — Prof. Licha De Colleville","6 — Candidato Presentó Renuncia","7 — Juan Carlos Cardozo","8 — Mirian Noceda","9 — Delcy Roman","10 — Gabriel Martinez","11 — Gladys Torres","12 — Natalia Gimenez"] },
    "2S": { nombre: "Honor Colorado S", color: "#e76f51", candidatos: ["1 — Abg. Carlos Sosa","2 — Luis Ibañez","3 — Lic. Marlene Quintana","4 — Dario Pintos","5 — Lelio Aquino","6 — Lic. Edita Fariña","7 — Lic. José Ruiz","8 — Prof. Fidencio Fernandez","9 — C.P. Gustavo Larroza","10 — Derlis Cuenca","11 — Vitinho","12 — Ariel Villar"] },
    "2T": { nombre: "Honor Colorado T", color: "#6d597a", candidatos: ["1 — Tio Charly","2 — Bettina Vera","3 — Mgtr. Carolina Caballero","4 — Prof. Gerónimo Davalos","5 — Mgtr. Alcides Barreto","6 — Abg. Leticia Zarate","7 — Abg. David Samudio","8 — Ramon Niz","9 — Gustavo Pavon","10 — Lic. Cristian Acuña","11 — Luana Duarte","12 — Isidro Torales"] },
    "5": { nombre: "Causa Republicana", color: "#b56576", candidatos: ["1 — Lidia Lopez Gimenez","2 — Katerin Pamela Acosta","3 — Alexi Francisco Baez Rodriguez","4 — Clara Ramona Alfonzo Lopez","5 — Elizabeth Alvarez Torres","6 — Maria Sinforiana Britos Espinola","7 — Liliana Alfonzo Lopez","8 — Ariel Britos Espinola","9 — Maria Griselda Nuñez Frasqueri","10 — Edison Ruben Diaz Aguirre","11 — Porfiria Lopez De Alfonzo","12 — Rosalia Soledad Alfonzo Lopez"] },
    "6": { nombre: "Colorado Añetete", color: "#f4a261", candidatos: ["1 — Jose Quintana","2 — Lucho Ramirez","3 — Chelo Venialgo","4 — Mercedes Martinez","5 — Herminia Ledesma","6 — Mirta Raquel Arias Sosa","7 — Evelyn Pereira","8 — Agustin Centurion","9 — Rosa Maria Amarilla Gonzalez","10 — Isidora More","11 — Carmen Leon","12 — Milagros Velazquez"] }
};
const BANCAS_TOTALES = 12;

// Variables globales
let votosIntendentes = {};
let votosListas = {};
let users = [];
let cargas = [];
let currentUser = null;

// -------------------- INICIALIZACIÓN --------------------
function initData() {
    locales.forEach(local => {
        if (!votosIntendentes[local]) votosIntendentes[local] = {};
        intendentes.forEach(i => { if (votosIntendentes[local][i.id] === undefined) votosIntendentes[local][i.id] = 0; });
        if (!votosListas[local]) votosListas[local] = {};
        Object.keys(listasConcejales).forEach(lid => { if (votosListas[local][lid] === undefined) votosListas[local][lid] = 0; });
    });
    const storedInt = localStorage.getItem("santani_votos_intendentes");
    const storedList = localStorage.getItem("santani_votos_listas");
    const storedUsers = localStorage.getItem("santani_users");
    const storedCargas = localStorage.getItem("santani_cargas");
    if (storedInt) votosIntendentes = JSON.parse(storedInt);
    if (storedList) votosListas = JSON.parse(storedList);
    if (storedUsers) users = JSON.parse(storedUsers);
    if (storedCargas) cargas = JSON.parse(storedCargas);
    if (!users.find(u => u.username === "Admin")) {
        users.push({ username: "Admin", password: "620rnasa", localAsignado: null, role: "admin" });
    }
    locales.forEach(local => {
        if (!votosIntendentes[local]) votosIntendentes[local] = {};
        intendentes.forEach(i => { if (votosIntendentes[local][i.id] === undefined) votosIntendentes[local][i.id] = 0; });
        if (!votosListas[local]) votosListas[local] = {};
        Object.keys(listasConcejales).forEach(lid => { if (votosListas[local][lid] === undefined) votosListas[local][lid] = 0; });
    });
    persistAll();
}
function persistAll() {
    localStorage.setItem("santani_votos_intendentes", JSON.stringify(votosIntendentes));
    localStorage.setItem("santani_votos_listas", JSON.stringify(votosListas));
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
        votosListas[local][listaId] = (votosListas[local][listaId] || 0) + votos;
        addCarga(usuario, local, "concejal", null, listaId, concejalNombre, votos);
    }
    persistAll();
    return true;
}
function totalIntendentes() {
    let total = { carlos_veron: 0, christian_decc: 0 };
    locales.forEach(local => {
        total.carlos_veron += votosIntendentes[local]["carlos_veron"];
        total.christian_decc += votosIntendentes[local]["christian_decc"];
    });
    return total;
}
function totalListas() {
    let total = {};
    Object.keys(listasConcejales).forEach(lid => total[lid] = 0);
    locales.forEach(local => {
        Object.keys(listasConcejales).forEach(lid => { total[lid] += votosListas[local][lid]; });
    });
    return total;
}

// -------------------- D'HONDT --------------------
function calcularDhondt(votosPorLista, bancas) {
    // votosPorLista: objeto { listaId: votos }
    // Retorna: { listaId: bancasAsignadas }
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
function renderDhondt() {
    const totalVotosLista = totalListas();
    const dhondt = calcularDhondt(totalVotosLista, BANCAS_TOTALES);
    let html = `<div style="background:#f4f1ea; border-radius:1rem; padding:1rem;"><h4>Distribución de ${BANCAS_TOTALES} bancas según voto de lista (D'Hondt)</h4><table class="vote-table"><thead><tr><th>Lista</th><th>Votos totales</th><th>Bancas asignadas</th><th>Concejales electos (en orden de lista)</th></tr></thead><tbody>`;
    const listasOrdenadas = Object.keys(listasConcejales).sort((a,b)=> (dhondt[b]||0) - (dhondt[a]||0));
    for (let lid of listasOrdenadas) {
        const votos = totalVotosLista[lid] || 0;
        const bancas = dhondt[lid] || 0;
        const listaInfo = listasConcejales[lid];
        const electos = listaInfo.candidatos.slice(0, bancas).join(", ");
        html += `<tr><td><strong>Lista ${lid}</strong><br><small>${listaInfo.nombre}</small></td><td>${votos.toLocaleString()}</td><td><span style="font-size:1.2rem; font-weight:bold;">${bancas}</span></td><td>${electos || "—"}</td></tr>`;
    }
    html += `</tbody></table></div>`;
    document.getElementById("dhondtResultado").innerHTML = html;
}

// -------------------- RENDER ADMIN --------------------
let chartInt, chartList;
function renderAdminStats() {
    renderTablaIntendentesPorLocal();
    renderTablaListasPorLocal();
    renderDetalleConcejales();
    renderDhondt();
    const totalInt = totalIntendentes();
    const ctxInt = document.getElementById('intendentesChart')?.getContext('2d');
    const ctxList = document.getElementById('listasChart')?.getContext('2d');
    if (ctxInt) {
        if (chartInt) chartInt.destroy();
        chartInt = new Chart(ctxInt, { type: 'bar', data: { labels: intendentes.map(i=>`${i.nombre} (${i.lista})`), datasets: [{ label: 'Votos totales', data: [totalInt.carlos_veron, totalInt.christian_decc], backgroundColor: ['#006D5B','#D81B60'] }] }, options: { responsive: true, scales: { y: { beginAtZero: true } } } });
    }
    if (ctxList) {
        if (chartList) chartList.destroy();
        const listaData = Object.keys(listasConcejales).map(lid=>totalListas()[lid]);
        chartList = new Chart(ctxList, { type: 'pie', data: { labels: Object.keys(listasConcejales).map(l=>`Lista ${l}`), datasets: [{ data: listaData, backgroundColor: Object.values(listasConcejales).map(l=>l.color) }] }, options: { responsive: true } });
    }
}
function renderTablaIntendentesPorLocal() {
    const thead = document.getElementById("intendentesHeader");
    const tbody = document.getElementById("intendentesBody");
    if(!thead) return;
    let header = "<tr><th>Local</th>"; intendentes.forEach(i=>{ header+=`<th>${i.nombre} (${i.lista})</th>`; }); header+="<th>Total Local</th></table>";
    thead.innerHTML = header;
    let body = "";
    locales.forEach(local => {
        let fila = `<td><td class="candidate-name">${local}</td>`;
        let sumaLocal=0;
        intendentes.forEach(i=>{ let v=votosIntendentes[local][i.id]||0; fila+=`<td>${v.toLocaleString()}</td>`; sumaLocal+=v; });
        fila+=`<td class="total-votes">${sumaLocal.toLocaleString()}</td></tr>`;
        body+=fila;
    });
    const totalG = totalIntendentes();
    body+=`<tr style="background:#f7ede3; font-weight:bold;"><td>TOTAL GENERAL</td><td>${totalG.carlos_veron.toLocaleString()}</td><td>${totalG.christian_decc.toLocaleString()}</td><td>${(totalG.carlos_veron+totalG.christian_decc).toLocaleString()}</td></tr>`;
    tbody.innerHTML = body;
}
function renderTablaListasPorLocal() {
    const thead = document.getElementById("listasHeader");
    const tbody = document.getElementById("listasBody");
    if(!thead) return;
    let header = "<tr><th>Local</th>"; Object.keys(listasConcejales).forEach(lid=>{ header+=`<th>Lista ${lid}<br><small>${listasConcejales[lid].nombre}</small></th>`; }); header+="<th>Total Local</th></tr>";
    thead.innerHTML = header;
    let body="";
    locales.forEach(local=>{
        let fila=`<tr><td class="candidate-name">${local}</td>`;
        let sumaLocal=0;
        Object.keys(listasConcejales).forEach(lid=>{ let v=votosListas[local][lid]||0; fila+=`<td>${v.toLocaleString()}</td>`; sumaLocal+=v; });
        fila+=`<td class="total-votes">${sumaLocal.toLocaleString()}</td></tr>`;
        body+=fila;
    });
    const totalL = totalListas();
    let sumaTotal=0;
    let filaTotal="<tr style='background:#f7ede3;font-weight:bold;'><td>TOTAL GENERAL</td>";
    Object.keys(listasConcejales).forEach(lid=>{ let v=totalL[lid]; filaTotal+=`<td>${v.toLocaleString()}</td>`; sumaTotal+=v; });
    filaTotal+=`<td>${sumaTotal.toLocaleString()}</td></tr>`;
    body+=filaTotal;
    tbody.innerHTML = body;
}
function renderDetalleConcejales() {
    const container = document.getElementById("concejalesDetalle");
    if(!container) return;
    const totalL = totalListas();
    let html = `<div style="display:flex; flex-wrap:wrap; gap:1rem;">`;
    for (const [lid, info] of Object.entries(listasConcejales)) {
        html += `<div style="flex:1; min-width:240px; background:#fef9ef; border-radius:1rem; padding:1rem; border-left:6px solid ${info.color};"><h4>Lista ${lid} – ${info.nombre}</h4><p><strong>Total votos lista:</strong> ${(totalL[lid]||0).toLocaleString()}</p><ul style="margin-top:0.5rem; padding-left:1rem;">`;
        info.candidatos.forEach(c=>{ html+=`<li style="font-size:0.8rem;">${c}</li>`; });
        html+=`</ul></div>`;
    }
    html+=`</div>`;
    container.innerHTML = html;
}
function renderUsersTable() {
    const tbody = document.getElementById("usersTableBody");
    if(!tbody) return;
    tbody.innerHTML = users.filter(u=>u.role !== "admin").map(u=>`<tr><td>${u.username}</td><td>${u.localAsignado}</td><td>digitador</td><td><button class="delete-user-btn" data-user="${u.username}" style="background:#b0154f; width:auto; padding:0.3rem 0.8rem;">Eliminar</button></td></tr>`).join("");
    document.querySelectorAll('.delete-user-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
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
    tbody.innerHTML = cargas.slice(0,200).map(c => `<tr><td>${new Date(c.timestamp).toLocaleString()}</td><td>${c.usuario}</td><td>${c.local}</td><td>${c.tipo === "intendente" ? "Intendente" : "Concejal"}</td><td>${c.candidatoId ? (intendentes.find(i=>i.id===c.candidatoId)?.nombre || c.candidatoId) : (c.listaId ? `Lista ${c.listaId}` : '')}</td><td>${c.concejalNombre || '-'}</td><td>${c.votos}</td></tr>`).join("");
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
    listaSelect.addEventListener('change', function() {
        const concejalSelect = document.getElementById("digConcejalSelect");
        if (this.value) {
            const candidatos = listasConcejales[this.value].candidatos;
            concejalSelect.disabled = false;
            concejalSelect.innerHTML = '<option value="">Seleccione concejal</option>' + candidatos.map(c => `<option value="${c}">${c}</option>`).join('');
        } else {
            concejalSelect.disabled = true;
            concejalSelect.innerHTML = '<option value="">Primero elija lista</option>';
        }
    });
    renderMisCargas();
}
function renderMisCargas() {
    const tbody = document.getElementById("misCargasBody");
    if(!tbody) return;
    const misCargas = cargas.filter(c => c.usuario === currentUser.username).slice(0,30);
    tbody.innerHTML = misCargas.map(c => `<tr><td>${new Date(c.timestamp).toLocaleString()}</td><td>${c.tipo === "intendente" ? "Intendente" : "Concejal"}</td><td>${c.tipo === "intendente" ? (intendentes.find(i=>i.id===c.candidatoId)?.nombre || c.candidatoId) : (c.concejalNombre || `Lista ${c.listaId}`)}</td><td>${c.votos}</td></tr>`).join("");
}

// -------------------- LOGIN --------------------
function showLoginModal() {
    const modal = document.createElement('div');
    modal.className = 'login-modal';
    modal.innerHTML = `
        <div class="login-card">
            <i class="fas fa-microphone-alt"></i>
            <h3>Radio Ñasaindy 620AM</h3>
            <p style="margin-bottom:1rem;">Sistema de Carga de Votos</p>
            <input type="text" id="loginUser" placeholder="Usuario" autocomplete="off">
            <input type="password" id="loginPass" placeholder="Contraseña">
            <button id="loginBtn">Ingresar</button>
            <button id="closeModalBtn" style="background:#6c8b82;">Cancelar</button>
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

// -------------------- EVENTOS --------------------
document.addEventListener('DOMContentLoaded', () => {
    initData();
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
            if (currentUser.role === 'admin') renderAdminStats();
            renderMisCargas();
        } else alert("Cantidad inválida");
    });
    document.getElementById('cargarConcejalBtn')?.addEventListener('click', () => {
        if(!currentUser || currentUser.role !== 'digitador') return;
        const listaId = document.getElementById('digListaSelect').value;
        const concejalNombre = document.getElementById('digConcejalSelect').value;
        const votos = parseInt(document.getElementById('digVotosConcejal').value);
        if (!listaId || !concejalNombre || votos<=0) { alert("Seleccione lista, concejal y cantidad válida"); return; }
        if (registrarVoto(currentUser.localAsignado, "concejal", null, votos, currentUser.username, concejalNombre, listaId)) {
            alert(`Voto concejal registrado: +${votos} para ${concejalNombre}`);
            document.getElementById('digVotosConcejal').value = '';
            if (currentUser.role === 'admin') renderAdminStats();
            renderMisCargas();
        } else alert("Error al registrar");
    });
    document.getElementById('createUserBtn')?.addEventListener('click', () => {
        if (currentUser?.role !== 'admin') return;
        const username = document.getElementById('newUsername').value.trim();
        const password = document.getElementById('newPassword').value.trim();
        const local = document.getElementById('newUserLocal').value;
        if (!username || !password) { alert("Complete usuario y contraseña"); return; }
        if (users.find(u=>u.username===username)) { alert("El usuario ya existe"); return; }
        users.push({ username, password, localAsignado: local, role: "digitador" });
        persistAll();
        renderUsersTable();
        document.getElementById('newUsername').value = '';
        document.getElementById('newPassword').value = '';
        alert("Usuario digitador creado");
    });
});
