const API_URL = 'https://script.google.com/macros/s/AKfycbzf-xeXCZM8elaekNy3EXCVhyiQRSCFbJiPWGFdV3veBKTEHX5wnCScNDH8o9Si4aLwWQ/exec';
const CLIENT_ID = '135041034475-9u7f4b93isfsvlh521fo82j8ifog1q5d.apps.googleusercontent.com';

let userEmail = null;
let activitiesData = []; //údaje o aktivitách načtené z GTabulky
let selectedActivities = []; // pole vybraných aktivit (max 5)

window.onload = function () {
    // Inicializace Google tlačítka
    google.accounts.id.initialize({
        client_id: CLIENT_ID,
        callback: handleCredentialResponse
    });
    google.accounts.id.renderButton(
        document.querySelector(".g_id_signin"),
        { theme: "outline", size: "large" }
    );
};

// Zpracování úspěšného přihlášení
function handleCredentialResponse(response) {
    const jwtToken = response.credential;
    const userPayload = parseJwt(jwtToken);
    
    userEmail = userPayload.email;
    
    // Skrytí tlačítka a zobrazení emailu
    document.querySelector('.g_id_signin').style.display = 'none';
    const emailSpan = document.getElementById('user-email');
    emailSpan.textContent = `Přihlášen: ${userEmail}`;
    emailSpan.style.display = 'inline';
    
    // Odkrytí aplikace a načtení dat
    document.getElementById('app-content').style.display = 'block';
    loadActivities();
}

// Stažení katalogu z GTabulky a ověření předchozí přihlášky
async function loadActivities() {
    try {
        // Odesíláme email jako parametr, aby mohl Apps Script vrátit i případné předchozí volby
        const res = await fetch(`${API_URL}?email=${encodeURIComponent(userEmail)}`);
        const json = await res.json();
        
        if (json.status === 'success') {
            activitiesData = json.data;
            document.getElementById('loading').style.display = 'none';
            
            // Pokud nám API vrátí předchozí volby (pole ID aktivit)
            if (json.previousSelection && json.previousSelection.length > 0) {
                // Namapujeme uložená ID zpět na objekty z katalogu
                selectedActivities = json.previousSelection.map(id => 
                    activitiesData.find(a => a.ID === id)
                ).filter(Boolean); // Odstraní neplatné záznamy, pokud by aktivita už neexistovala
                
                // Upozorníme uživatele a upravíme tlačítko
                const msg = document.getElementById('status-message');
                msg.style.color = '#2563eb';
                msg.textContent = 'Načetli jsme vaši dříve odeslanou přihlášku. Můžete ji upravit a odeslat znovu.';
                document.getElementById('submit-btn').textContent = 'Odeslat změnu přihlášky';
            }

            renderCatalog();
            renderSelection();
        }
    } catch (err) {
        document.getElementById('loading').textContent = 'Chyba při načítání dat.';
    }
}

// Vykreslení karet aktivit
function renderCatalog() {
    const grid = document.getElementById('activities-grid');
    grid.innerHTML = '';
    
    activitiesData.forEach(act => {
        const isSelected = selectedActivities.some(s => s.ID === act.ID);
        const procentoZaplneni = Math.min((act.AktualniZajem / act.Kapacita) * 100, 100);
        let barClass = 'capacity-fill';
        if (procentoZaplneni > 75) barClass += ' high';
        if (procentoZaplneni >= 100) barClass += ' full';

        const card = document.createElement('div');
        // Přidáme třídu is-selected, pokud je karta vybrána
        card.className = `activity-card ${isSelected ? 'is-selected' : ''}`;
        
        card.innerHTML = `
            <h3>${act.Nazev}</h3>
            <p><small>${act.Organizatori} | ${act.Misto}</small></p>
            <p>${act.Popis}</p>
            <p><strong>Co s sebou:</strong> ${act.Poplatek}</p>
            <div>
                <small>Zájem: ${act.AktualniZajem} / Kapacita: ${act.Kapacita}</small>
                <div class="capacity-bar">
                    <div class="${barClass}" style="width: ${procentoZaplneni}%"></div>
                </div>
            </div>
            <!-- Zrušili jsme atribut disabled a dynamicky měníme třídu i text -->
            <button class="btn-add ${isSelected ? 'btn-cancel' : ''}">
                ${isSelected ? 'Je vybráno - zrušit výběr' : 'Přidat do preferencí'}
            </button>
        `;

        // Event listener na tlačítko podle stavu
        const btn = card.querySelector('.btn-add');
        if (isSelected) {
            // Pokud je už vybráno, kliknutí aktivitu odebere
            btn.onclick = () => removeActivity(act.ID);
        } else {
            // Pokud není vybráno, kliknutí ji přidá
            btn.onclick = () => selectActivity(act);
        }
        
        grid.appendChild(card);
    });
}

function selectActivity(act) {
    if (selectedActivities.length >= 5) {
        alert('Můžete vybrat maximálně 5 aktivit!');
        return;
    }
    selectedActivities.push(act);
    renderCatalog();
    renderSelection();
}

function removeActivity(id) {
    selectedActivities = selectedActivities.filter(a => a.ID !== id);
    renderCatalog();
    renderSelection();
}

// Vykreslení vybraných preferencí s podporou Drag & Drop

// Globální pomocná proměnná pro uchování indexu (řeší chybu na mobilech)
let currentDraggedIndex = null;

function renderSelection() {
    const list = document.getElementById('selected-list');
    list.innerHTML = '';

    selectedActivities.forEach((act, index) => {
        const slot = document.createElement('div');
        slot.className = 'selected-slot';
        slot.draggable = true; 

        // Události pro Drag & Drop
        slot.addEventListener('dragstart', (e) => {
            slot.classList.add('dragging');
            e.dataTransfer.setData('text/plain', index);
            currentDraggedIndex = index;
        });

        slot.addEventListener('dragend', () => {
            slot.classList.remove('dragging');
            currentDraggedIndex = null;
        });

        slot.addEventListener('dragenter', (e) => {
            e.preventDefault(); 
        });

        slot.addEventListener('dragover', (e) => {
            e.preventDefault(); // Nutné pro povolení události 'drop'
        });

        slot.addEventListener('drop', (e) => {
            e.preventDefault();
            const draggedIndex = currentDraggedIndex !== null ? currentDraggedIndex : parseInt(e.dataTransfer.getData('text/plain'));
            const targetIndex = index;

            if (draggedIndex !== targetIndex && !isNaN(draggedIndex)) {
                // Přesun položky v poli
                const draggedItem = selectedActivities.splice(draggedIndex, 1)[0];
                selectedActivities.splice(targetIndex, 0, draggedItem);
                
                renderCatalog();
                renderSelection();
            }
        });
        
        slot.innerHTML = `
            <span class="drag-handle">☰</span>
            <span><strong>${index + 1}. volba:</strong> ${act.Nazev}</span>
            <button class="btn-remove" onclick="removeActivity('${act.ID}')">X</button>
        `;
        list.appendChild(slot);
    });

    // Doplnění chybějících slotů do celkových 5
    for (let i = selectedActivities.length; i < 5; i++) {
        const slot = document.createElement('div');
        slot.className = 'selected-slot';
        slot.innerHTML = `<span style="color: #94a3b8;">${i + 1}. volba: (zatím nevybráno)</span>`;
        list.appendChild(slot);
    }

    // Povolit odeslání jen pokud je vybráno přesně 5
    document.getElementById('submit-btn').disabled = selectedActivities.length !== 5;
}

// Odeslání do Google Sheets API
document.getElementById('submit-btn').onclick = async () => {
    const btn = document.getElementById('submit-btn');
    const msg = document.getElementById('status-message');
    
    btn.disabled = true;
    btn.textContent = 'Odesílám...';
    
    const payload = {
        email: userEmail,
        volby: selectedActivities.map(a => a.ID)
    };

    try {
        // Nutné text/plain, aby Google API neblokovalo CORS
        const res = await fetch(API_URL, {
            method: 'POST',
            body: JSON.stringify(payload)
        });
        
        const json = await res.json();
        if (json.status === 'success') {
            msg.style.color = 'green';
            msg.textContent = 'Vaše volby byly úspěšně uloženy!';
            btn.textContent = 'Úspěšně odesláno';
            loadActivities(); // Načteme znovu, aby se aktualizoval stav    
        }
    } catch (err) {
        msg.style.color = 'red';
        msg.textContent = 'Chyba při odesílání. Zkuste to prosím znovu.';
        btn.disabled = false;
        btn.textContent = 'Odeslat přihlášku';
    }
};

// Pomocná funkce pro přečtení tokenu od Googlu
function parseJwt(token) {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(window.atob(base64).split('').map(function(c) {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
    }).join(''));
    return JSON.parse(jsonPayload);
}
