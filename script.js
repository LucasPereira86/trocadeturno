// Estado da aplicação
let selectedShift = null;
const maintenance = {
    pending: [],
    completed: []
};

const PLACEHOLDERS = {
    pending: 'Descreva a manutenção a ser realizada...',
    completed: 'Descreva a manutenção realizada...'
};

const EMPTY_MESSAGES = {
    pending: 'Nenhuma manutenção pendente',
    completed: 'Nenhuma manutenção realizada'
};

// Grupos de fotos de cada tabela
const PHOTO_GROUPS = {
    pending: [{ key: 'fotos', label: 'Fotos' }],
    completed: [
        { key: 'antes', label: 'Antes' },
        { key: 'depois', label: 'Depois' }
    ]
};

// Fotos carregadas na memória (id -> imagem em data URL)
const photoCache = new Map();

// Inicialização
document.addEventListener('DOMContentLoaded', async () => {
    loadFromLocalStorage();
    renderTables();
    await loadPhotos();
    renderTables();

    ['pending', 'completed'].forEach(type => {
        const body = document.getElementById(`${type}Body`);

        // Salva a cada tecla, para não perder o que foi digitado se o app for fechado
        body.addEventListener('input', event => {
            const field = event.target.dataset.field;
            if (field) {
                updateItem(type, event.target.closest('tr').dataset.id, field, event.target.value);
            }
        });

        body.addEventListener('change', event => {
            const input = event.target;
            if (input.type === 'file' && input.files.length > 0) {
                const group = input.closest('.photo-group').dataset.group;
                addPhotos(type, input.closest('tr').dataset.id, group, [...input.files]);
                input.value = '';
            }
        });

        body.addEventListener('click', event => {
            const row = event.target.closest('tr');

            if (event.target.closest('.delete-btn')) {
                removeRow(type, row.dataset.id);
            } else if (event.target.closest('.photo-remove')) {
                const thumb = event.target.closest('.photo-thumb');
                removePhoto(type, row.dataset.id, thumb.closest('.photo-group').dataset.group, thumb.dataset.photo);
            } else if (event.target.closest('.photo-thumb img')) {
                openPhotoViewer(event.target.src);
            }
        });
    });

    // Garante que o relatório impresso esteja atualizado mesmo com Ctrl+P
    window.addEventListener('beforeprint', fillReport);
});

// Gerar identificador único
function newId() {
    if (window.crypto && crypto.randomUUID) {
        return crypto.randomUUID();
    }
    return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

// Selecionar turno
function selectShift(shift) {
    selectedShift = shift;
    updateShiftButtons();
    saveToLocalStorage();
}

function updateShiftButtons() {
    document.querySelectorAll('.shift-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.shift === selectedShift);
    });
}

// Adicionar nova linha na tabela
function addRow(type) {
    maintenance[type].push({
        id: newId(),
        frota: '',
        manutencao: '',
        observacao: '',
        photos: {}
    });

    renderTables();
    saveToLocalStorage();
}

// Remover linha
function removeRow(type, id) {
    const item = maintenance[type].find(item => item.id === id);
    if (!item) return;

    const photoIds = allPhotoIds(item);
    if (photoIds.length > 0 && !confirm('Esta linha tem fotos. Excluir mesmo assim?')) {
        return;
    }

    maintenance[type] = maintenance[type].filter(item => item.id !== id);
    photoIds.forEach(deletePhotoData);
    renderTables();
    saveToLocalStorage();
}

// Atualizar item
function updateItem(type, id, field, value) {
    const item = maintenance[type].find(item => item.id === id);
    if (item) {
        item[field] = value;
        saveToLocalStorage();
    }
}

// Fotos de um grupo do item
function itemPhotos(item, group) {
    return (item.photos && item.photos[group]) || [];
}

function allPhotoIds(item) {
    return Object.values(item.photos || {}).flat();
}

// Renderizar tabelas
function renderTables() {
    ['pending', 'completed'].forEach(type => {
        document.getElementById(`${type}Body`).innerHTML = maintenance[type].map(item => `
            <tr class="item-row" data-id="${escapeHtml(item.id)}">
                <td>
                    <input type="text"
                           value="${escapeHtml(item.frota)}"
                           placeholder="Ex: 1234"
                           data-field="frota">
                </td>
                <td>
                    <textarea rows="2"
                              placeholder="${PLACEHOLDERS[type]}"
                              data-field="manutencao">${escapeHtml(item.manutencao)}</textarea>
                </td>
                <td>
                    <textarea rows="2"
                              placeholder="Observações adicionais..."
                              data-field="observacao">${escapeHtml(item.observacao)}</textarea>
                </td>
                <td class="action-col">
                    <button class="delete-btn" type="button" aria-label="Excluir linha" title="Excluir linha">&times;</button>
                </td>
            </tr>
            <tr class="photo-row" data-id="${escapeHtml(item.id)}">
                <td colspan="4">
                    <div class="photo-groups">
                        ${PHOTO_GROUPS[type].map(group => renderPhotoGroup(item, group)).join('')}
                    </div>
                </td>
            </tr>
        `).join('');
    });
}

function renderPhotoGroup(item, group) {
    const thumbs = itemPhotos(item, group.key)
        .filter(id => photoCache.has(id))
        .map(id => `
            <div class="photo-thumb" data-photo="${escapeHtml(id)}">
                <img src="${photoCache.get(id)}" alt="Foto ${group.label.toLowerCase()}">
                <button class="photo-remove" type="button" aria-label="Excluir foto" title="Excluir foto">&times;</button>
            </div>
        `).join('');

    return `
        <div class="photo-group" data-group="${group.key}">
            <span class="photo-label">${group.label}</span>
            <div class="photo-list">
                ${thumbs}
                <label class="photo-btn" title="Tirar foto">
                    Câmera
                    <input type="file" accept="image/*" capture="environment" hidden>
                </label>
                <label class="photo-btn" title="Anexar foto da galeria">
                    Galeria
                    <input type="file" accept="image/*" multiple hidden>
                </label>
            </div>
        </div>
    `;
}

// Adicionar fotos a um item
async function addPhotos(type, id, group, files) {
    const item = maintenance[type].find(item => item.id === id);
    if (!item) return;

    showToast('Processando foto...', 'info');

    let added = 0;
    for (const file of files) {
        try {
            const data = await compressImage(file);
            const photoId = newId();
            await photoDB.put(photoId, data);
            photoCache.set(photoId, data);

            item.photos = item.photos || {};
            item.photos[group] = [...itemPhotos(item, group), photoId];
            added++;
        } catch (error) {
            console.error('Erro ao salvar foto:', error);
        }
    }

    saveToLocalStorage();
    renderTables();

    if (added === files.length) {
        showToast(added > 1 ? `${added} fotos adicionadas!` : 'Foto adicionada!', 'success');
    } else {
        showToast('Não foi possível salvar alguma foto.', 'error');
    }
}

// Remover uma foto
function removePhoto(type, id, group, photoId) {
    const item = maintenance[type].find(item => item.id === id);
    if (!item || !confirm('Excluir esta foto?')) return;

    item.photos[group] = itemPhotos(item, group).filter(p => p !== photoId);
    deletePhotoData(photoId);
    saveToLocalStorage();
    renderTables();
}

function deletePhotoData(photoId) {
    photoCache.delete(photoId);
    photoDB.remove(photoId).catch(error => console.error('Erro ao excluir foto:', error));
}

// Carregar as fotos salvas no aparelho
async function loadPhotos() {
    const ids = [...maintenance.pending, ...maintenance.completed].flatMap(allPhotoIds);
    for (const id of ids) {
        try {
            const data = await photoDB.get(id);
            if (data) photoCache.set(id, data);
        } catch (error) {
            console.error('Erro ao carregar foto:', error);
        }
    }
}

// Reduzir a foto para não ocupar muito espaço (fotos de celular têm vários MB)
function compressImage(file, maxSize = 1280, quality = 0.75) {
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const img = new Image();

        img.onload = () => {
            const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
            const canvas = document.createElement('canvas');
            canvas.width = Math.round(img.width * scale);
            canvas.height = Math.round(img.height * scale);
            canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
            URL.revokeObjectURL(url);
            resolve(canvas.toDataURL('image/jpeg', quality));
        };

        img.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error('Arquivo de imagem inválido'));
        };

        img.src = url;
    });
}

// Ver a foto em tela cheia
function openPhotoViewer(src) {
    const viewer = document.createElement('div');
    viewer.className = 'photo-viewer';
    viewer.innerHTML = `
        <img src="${src}" alt="Foto ampliada">
        <button class="photo-viewer-close" type="button" aria-label="Fechar">&times;</button>
    `;
    viewer.addEventListener('click', () => viewer.remove());
    document.body.appendChild(viewer);
}

// Banco de fotos no aparelho (IndexedDB aguenta muito mais que o localStorage)
const photoDB = (() => {
    let dbPromise = null;

    function open() {
        if (!dbPromise) {
            dbPromise = new Promise((resolve, reject) => {
                const request = indexedDB.open('trocaTurnoFotos', 1);
                request.onupgradeneeded = () => request.result.createObjectStore('fotos');
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });
        }
        return dbPromise;
    }

    async function run(mode, action) {
        const db = await open();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction('fotos', mode);
            const request = action(transaction.objectStore('fotos'));
            transaction.oncomplete = () => resolve(request.result);
            transaction.onerror = () => reject(transaction.error);
        });
    }

    return {
        get: id => run('readonly', store => store.get(id)),
        put: (id, data) => run('readwrite', store => store.put(data, id)),
        remove: id => run('readwrite', store => store.delete(id)),
        clear: () => run('readwrite', store => store.clear())
    };
})();

// Linhas com algum conteúdo (linhas totalmente vazias não entram no relatório)
function filledItems(type) {
    return maintenance[type].filter(item =>
        [item.frota, item.manutencao, item.observacao].some(value => value && value.trim())
        || allPhotoIds(item).length > 0
    );
}

// Verifica se é possível gerar o relatório
function canGenerateReport() {
    if (!selectedShift) {
        showToast('Por favor, selecione um turno primeiro!', 'warning');
        return false;
    }

    if (filledItems('pending').length === 0 && filledItems('completed').length === 0) {
        showToast('Adicione pelo menos uma manutenção!', 'warning');
        return false;
    }

    return true;
}

// Fotos de um item no relatório
function reportPhotosRow(type, item) {
    const groups = PHOTO_GROUPS[type]
        .map(group => ({ ...group, ids: itemPhotos(item, group.key).filter(id => photoCache.has(id)) }))
        .filter(group => group.ids.length > 0);

    if (groups.length === 0) return '';

    return `
        <tr class="report-photos">
            <td colspan="3">
                ${groups.map(group => `
                    <div class="report-photo-group">
                        <span class="report-photo-label">${group.label}</span>
                        <div class="report-photo-list">
                            ${group.ids.map(id => `<img src="${photoCache.get(id)}" alt="">`).join('')}
                        </div>
                    </div>
                `).join('')}
            </td>
        </tr>
    `;
}

// Preencher o relatório com os dados atuais
function fillReport() {
    document.getElementById('reportShift').textContent = selectedShift ? `Turno ${selectedShift}` : '-';
    document.getElementById('reportDate').textContent = new Date().toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });

    const typeToBody = { pending: 'reportPendingBody', completed: 'reportCompletedBody' };
    Object.entries(typeToBody).forEach(([type, bodyId]) => {
        const items = filledItems(type);
        document.getElementById(bodyId).innerHTML = items.length > 0
            ? items.map(item => `
                <tr>
                    <td><strong>${escapeHtml(item.frota) || '-'}</strong></td>
                    <td>${escapeHtml(item.manutencao) || '-'}</td>
                    <td>${escapeHtml(item.observacao) || '-'}</td>
                </tr>
                ${reportPhotosRow(type, item)}
            `).join('')
            : `<tr><td colspan="3" class="report-empty">${EMPTY_MESSAGES[type]}</td></tr>`;
    });
}

// Gerar relatório em imagem
async function generateReport() {
    if (!canGenerateReport()) return;

    if (typeof html2canvas === 'undefined') {
        showToast('Não foi possível carregar o gerador de imagem. Verifique a internet.', 'error');
        return;
    }

    fillReport();

    // Mostrar container temporariamente para captura
    const reportContainer = document.getElementById('reportContainer');
    reportContainer.classList.add('capturing');

    try {
        const canvas = await html2canvas(document.getElementById('report'), {
            scale: 2,
            backgroundColor: '#ffffff',
            useCORS: true
        });

        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        // Data local (toISOString usa UTC e à noite daria o dia seguinte)
        const now = new Date();
        const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        link.download = `troca-turno-${selectedShift}-${date}.png`;
        link.href = url;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);

        showToast('Relatório gerado com sucesso!', 'success');
    } catch (error) {
        console.error('Erro ao gerar relatório:', error);
        showToast('Erro ao gerar relatório!', 'error');
    } finally {
        reportContainer.classList.remove('capturing');
    }
}

// Imprimir PDF (o CSS de impressão mostra apenas o relatório)
function printPDF() {
    if (!canGenerateReport()) return;

    fillReport();
    window.print();
}

// Limpar tudo
function clearAll() {
    if (confirm('Tem certeza que deseja limpar todos os dados?')) {
        selectedShift = null;
        maintenance.pending = [];
        maintenance.completed = [];
        photoCache.clear();
        photoDB.clear().catch(error => console.error('Erro ao apagar fotos:', error));

        updateShiftButtons();
        renderTables();
        saveToLocalStorage();
        showToast('Dados limpos com sucesso!', 'info');
    }
}

// Salvar no LocalStorage (as fotos ficam no IndexedDB; aqui só os ids)
function saveToLocalStorage() {
    const data = {
        selectedShift,
        pendingMaintenance: maintenance.pending,
        completedMaintenance: maintenance.completed
    };
    try {
        localStorage.setItem('trocaTurnoData', JSON.stringify(data));
    } catch (e) {
        console.error('Erro ao salvar dados:', e);
    }
}

// Carregar do LocalStorage
function loadFromLocalStorage() {
    try {
        const saved = localStorage.getItem('trocaTurnoData');
        if (!saved) return;

        const data = JSON.parse(saved);
        selectedShift = data.selectedShift || null;
        // Versões antigas usavam ids numéricos e não tinham fotos
        const normalize = list => (list || []).map(item => ({ photos: {}, ...item, id: String(item.id) }));
        maintenance.pending = normalize(data.pendingMaintenance);
        maintenance.completed = normalize(data.completedMaintenance);

        updateShiftButtons();
    } catch (e) {
        console.error('Erro ao carregar dados:', e);
    }
}

// Escapar HTML para prevenir XSS
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML.replace(/"/g, '&quot;');
}

// Mostrar toast de notificação
function showToast(message, type = 'success') {
    const existingToast = document.querySelector('.toast');
    if (existingToast) {
        existingToast.remove();
    }

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.setAttribute('role', 'status');
    toast.textContent = message;
    document.body.appendChild(toast);

    // Animar entrada
    setTimeout(() => toast.classList.add('show'), 10);

    // Remover após 3 segundos
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}
