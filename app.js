// ============ 工具 ============
const $ = (s) => document.querySelector(s);

const uuid = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
});
const now = () => Date.now();

function formatDate(ts) {
    const d = new Date(ts);
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
function todayStr() { return formatDate(now()).slice(0, 10); }
function escapeHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ============ IndexedDB ============
let db;
function openDB() {
    return new Promise((res, rej) => {
        const r = indexedDB.open('noteforge', 2);
        r.onupgradeneeded = (e) => {
            const d = e.target.result;
            if (!d.objectStoreNames.contains('subjects')) d.createObjectStore('subjects', { keyPath: 'id' });
            if (!d.objectStoreNames.contains('notes')) d.createObjectStore('notes', { keyPath: 'id' });
            if (!d.objectStoreNames.contains('settings')) d.createObjectStore('settings', { keyPath: 'key' });
            if (!d.objectStoreNames.contains('assets')) d.createObjectStore('assets', { keyPath: 'id' });
        };
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
    });
}
function idbAll(store) {
    return new Promise((res, rej) => {
        const r = db.transaction(store, 'readonly').objectStore(store).getAll();
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
    });
}
function idbPut(store, val) {
    return new Promise((res, rej) => {
        const r = db.transaction(store, 'readwrite').objectStore(store).put(val);
        r.onsuccess = () => res();
        r.onerror = () => rej(r.error);
    });
}
function idbDel(store, key) {
    return new Promise((res, rej) => {
        const r = db.transaction(store, 'readwrite').objectStore(store).delete(key);
        r.onsuccess = () => res();
        r.onerror = () => rej(r.error);
    });
}
function idbGet(store, key) {
    return new Promise((res, rej) => {
        const r = db.transaction(store, 'readonly').objectStore(store).get(key);
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
    });
}
async function getSetting(k, d) { const r = await idbGet('settings', k); return r ? r.value : d; }
async function setSetting(k, v) { await idbPut('settings', { key: k, value: v }); }

let saveTimer = null;

// ============ 状态 ============
const assetMap = new Map(); // assetId -> blob URL，用于渲染时同步查找
const state = {
    subjects: [],
    notes: [],
    currentSubjectId: null,
    currentNoteId: null,
    editMode: false,
    selectionMode: false,
    selectedNoteIds: new Set(),
    subjectSelectionMode: false,
    selectedSubjectIds: new Set(),
};

// ============ 初始化 ============
async function init() {
    db = await openDB();
    await loadAllAssets();
    state.subjects = (await idbAll('subjects')).sort((a, b) => a.order - b.order);
    state.notes = await idbAll('notes');

    await seedIfNeeded();

    applyFontSize(await getSetting('fontSize', 16));
    applyTheme(await getSetting('theme', 'auto'));

    const defId = await getSetting('defaultSubjectId', null);
    if (defId && state.subjects.find((s) => s.id === defId)) {
        state.currentSubjectId = defId;
    } else if (state.subjects.length > 0) {
        state.currentSubjectId = state.subjects[0].id;
    }

    renderSubjects();
    renderNotes();
    renderEditor();
    bindEvents();
    await initToolbar();
    registerSW();
}

async function loadAllAssets() {
    const assets = await idbAll('assets');
    for (const a of assets) {
        if (!assetMap.has(a.id)) assetMap.set(a.id, URL.createObjectURL(a.blob));
    }
}

async function seedIfNeeded() {
    const initialized = await getSetting('initialized', false);
    if (initialized) return;

    const subjId = uuid();
    const ts = now();
    const subject = { id: subjId, name: '必读', order: 0 };
    const note = {
        id: uuid(),
        subjectId: subjId,
        title: '使用说明与 Markdown 速查',
        content: `# 欢迎使用 NoteForge

一个**完全离线**的 Markdown 笔记应用。数据保存在你的浏览器里，不需要网络也能写。

## 快速上手

- 左上角 ☰ 打开科目列表
- 科目栏右上角 ＋ 新建科目，🗑 删除当前科目
- 笔记列表右上角 ＋ 新建笔记，☑ 进入选择模式
- 右上角 ⋮ 打开设置（外观、字体、默认科目、模板、导入导出）

## 数据存在哪

笔记保存在浏览器 IndexedDB 里，关闭页面不丢，但**清理浏览器数据会丢失**。所以要定期导出备份。

⋮ → 导出数据，会下载一个 zip 文件，包含全部笔记、科目、图片。传到另一台设备，用 ⋮ → 导入数据 恢复。

## Markdown 速查

### 标题

\`# 一级\`、\`## 二级\`、\`### 三级\`

### 强调

\`**粗体**\`、\`*斜体*\`、\`~~删除线~~\`

### 列表

无序用 \`- \`，有序用 \`1. \`，任务列表用 \`- [ ]\` 和 \`- [x]\`。

### 链接与图片

链接：\`[文字](https://example.com)\`

图片：点编辑页右上角 🖼 按钮插入。图片会存进笔记里，导出时一起打包。

### 代码

行内用反引号，代码块用三个反引号包裹并标语言名：

\`\`\`python
print("hello")
\`\`\`

### 表格

用 \`|\` 分列，第二行用 \`---\` 定表头：

\`\`\`
| 字段 | 含义 |
| --- | --- |
| title | 标题 |
\`\`\`

### 引用

\`> 被引用的话\`

---

这篇笔记可以删，也可以留着当参考。`,
        createdAt: ts,
        updatedAt: ts,
    };

    await idbPut('subjects', subject);
    await idbPut('notes', note);
    state.subjects.push(subject);
    state.notes.push(note);
    await setSetting('initialized', true);
}

// ============ 渲染 ============
function renderSubjects() {
    const ul = $('#subjectList');
    ul.innerHTML = '';
    for (const s of state.subjects) {
        const li = document.createElement('li');
        li.className = 'subject-item' + (s.id === state.currentSubjectId ? ' active' : '');
        li.dataset.id = s.id;
        li.draggable = !state.subjectSelectionMode;
        if (state.subjectSelectionMode && state.selectedSubjectIds.has(s.id)) {
            li.classList.add('selected');
        }

        if (state.subjectSelectionMode) {
            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.className = 'subject-check';
            cb.checked = state.selectedSubjectIds.has(s.id);
            li.appendChild(cb);
        }

        const span = document.createElement('span');
        span.className = 'subject-name';
        span.textContent = s.name;
        li.appendChild(span);
        ul.appendChild(li);
    }
    updateSubjectSelectionUI();
}

function renderNotes() {
    const ul = $('#noteList');
    const nameEl = $('#currentSubjectName');
    const emptyEl = $('#noteListEmpty');
    ul.innerHTML = '';

    const subj = state.subjects.find((s) => s.id === state.currentSubjectId);
    nameEl.textContent = subj ? subj.name : '未选择科目';

    if (!subj) {
        emptyEl.textContent = '还没有科目，点击左侧 + 新建';
        emptyEl.style.display = 'block';
        updateSelectionUI();
        return;
    }
    const notes = state.notes
        .filter((n) => n.subjectId === subj.id)
        .sort((a, b) => b.updatedAt - a.updatedAt);

    if (notes.length === 0) {
        emptyEl.textContent = '还没有笔记，点击右上角 + 新建一篇';
        emptyEl.style.display = 'block';
        updateSelectionUI();
        return;
    }
    emptyEl.style.display = 'none';

    for (const n of notes) {
        const li = document.createElement('li');
        li.className = 'note-item';
        li.dataset.id = n.id;
        if (state.selectionMode && state.selectedNoteIds.has(n.id)) {
            li.classList.add('selected');
        }

        if (state.selectionMode) {
            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.className = 'note-check';
            cb.checked = state.selectedNoteIds.has(n.id);
            li.appendChild(cb);
        }

        const body = document.createElement('div');
        body.className = 'note-body';
        const t = document.createElement('div');
        t.className = 'note-item-title';
        t.textContent = n.title || '(无标题)';
        const m = document.createElement('div');
        m.className = 'note-item-meta';
        m.textContent = formatDate(n.updatedAt);
        body.append(t, m);
        li.appendChild(body);

        ul.appendChild(li);
    }

    updateSelectionUI();
}

function renderEditor() {
    if (state.currentNoteId) {
        const n = state.notes.find((x) => x.id === state.currentNoteId);
        if (n) {
            $('#noteTitle').value = n.title || '';
            $('#noteContent').value = n.content || '';
            updatePreview();
            $('#noteListView').classList.add('hidden');
            $('#editorView').classList.remove('hidden');
            $('#editToggleBtn').classList.remove('hidden');
            updateToolbarVisibility();
            return;
        }
    }
    $('#noteListView').classList.remove('hidden');
    $('#editorView').classList.add('hidden');
    $('#editToggleBtn').classList.add('hidden');
    updateToolbarVisibility();
}

// ============ Markdown 渲染（极简版） ============
function renderMarkdown(md) {
    // 先把内部的 nf:asset/<id> 引用换成 blob URL
    const pre = md.replace(/!\[([^\]]*)\]\(nf:asset\/([\w-]+)\)/g, (m, alt, id) => {
        const url = assetMap.get(id);
        return url ? `![${alt}](${url})` : `![图片丢失:${id}]()`;
    });
    return marked.parse(pre, {
        gfm: true,      // 表格、任务列表、删除线
        breaks: true,   // 单个换行当换行处理（便签场景更自然）
    });
}

function updatePreview() {
    const pv = $('#previewPane');
    pv.innerHTML = renderMarkdown($('#noteContent').value);
    if (window.hljs) {
        pv.querySelectorAll('pre code[class*="language-"]').forEach((el) => hljs.highlightElement(el));
    }
    pv.querySelectorAll('input[type="checkbox"]').forEach((cb) => { cb.disabled = false; });
}

// ============ 事件 ============
function bindEvents() {

    $('#menuBtn').addEventListener('click', () => {
        if (window.innerWidth <= 768) {
            $('#sidebar').classList.toggle('open');
            $('#overlay').classList.toggle('hidden');
        } else {
            $('#sidebar').classList.toggle('collapsed');
        }
    });
    $('#overlay').addEventListener('click', () => {
        $('#sidebar').classList.remove('open');
        $('#overlay').classList.add('hidden');
    });

    $('#editToggleBtn').addEventListener('click', () => {
        state.editMode = !state.editMode;
        $('#editToggleBtn').textContent = state.editMode ? '预览' : '编辑';
        const body = $('#editorBody');
        body.classList.toggle('mode-edit', state.editMode);
        body.classList.toggle('mode-preview', !state.editMode);
        updateToolbarVisibility();
    });

    $('#moreBtn').addEventListener('click', (e) => {
        e.stopPropagation();
        $('#moreMenu').classList.toggle('hidden');
    });
    document.addEventListener('click', (e) => {
        if (!$('#moreMenu').contains(e.target) && e.target !== $('#moreBtn')) {
            $('#moreMenu').classList.add('hidden');
        }
    });
    $('#moreMenu').addEventListener('click', (e) => {
        const a = e.target.dataset.action;
        if (!a) return;
        $('#moreMenu').classList.add('hidden');
        handleAction(a);
    });

    $('#addSubjectBtn').addEventListener('click', addSubject);
    $('#addNoteBtn').addEventListener('click', addNote);

    $('#deleteSubjectBtn').addEventListener('click', deleteSubject);
    $('#filterNotesBtn').addEventListener('click', enterSelectionMode);
    $('#cancelSelectBtn').addEventListener('click', exitSelectionMode);
    $('#selectAllBtn').addEventListener('click', toggleSelectAll);
    $('#moveSelectedBtn').addEventListener('click', moveSelected);
    $('#deleteSelectedBtn').addEventListener('click', deleteSelected);

    $('#filterSubjectsBtn').addEventListener('click', enterSubjectSelectionMode);
    $('#cancelSubjectSelectBtn').addEventListener('click', exitSubjectSelectionMode);
    $('#selectAllSubjectsBtn').addEventListener('click', toggleSelectAllSubjects);
    $('#deleteSelectedSubjectsBtn').addEventListener('click', deleteSelectedSubjects);

    $('#deleteNoteBtn').addEventListener('click', deleteNote);
    $('#backBtn').addEventListener('click', () => {
        state.currentNoteId = null;
        state.editMode = false;
        state.selectionMode = false;
        state.selectedNoteIds.clear();
        $('#editToggleBtn').textContent = '编辑';
        $('#editorBody').classList.remove('mode-edit');
        $('#editorBody').classList.add('mode-preview');
        renderNotes();
        renderEditor();
    });

    $('#subjectList').addEventListener('click', (e) => {
        const li = e.target.closest('.subject-item');
        if (!li) return;
        const subjId = li.dataset.id;

        if (state.subjectSelectionMode) {
            if (state.selectedSubjectIds.has(subjId)) {
                state.selectedSubjectIds.delete(subjId);
            } else {
                state.selectedSubjectIds.add(subjId);
            }
            renderSubjects();
            return;
        }

        state.currentSubjectId = subjId;
        state.currentNoteId = null;
        state.editMode = false;
        $('#editToggleBtn').textContent = '编辑';
        $('#editorBody').classList.remove('mode-edit');
        $('#editorBody').classList.add('mode-preview');
        renderSubjects();
        renderNotes();
        renderEditor();
        if (window.innerWidth <= 768) {
            $('#sidebar').classList.remove('open');
            $('#overlay').classList.add('hidden');
        }
    });

    $('#noteList').addEventListener('click', (e) => {
        const li = e.target.closest('.note-item');
        if (!li) return;
        const noteId = li.dataset.id;

        if (state.selectionMode) {
            if (state.selectedNoteIds.has(noteId)) {
                state.selectedNoteIds.delete(noteId);
            } else {
                state.selectedNoteIds.add(noteId);
            }
            renderNotes();
            return;
        }

        state.currentNoteId = noteId;
        state.editMode = false;
        $('#editToggleBtn').textContent = '编辑';
        $('#editorBody').classList.remove('mode-edit');
        $('#editorBody').classList.add('mode-preview');
        renderEditor();
    });

    const scheduleSave = () => {
        clearTimeout(saveTimer);
        saveTimer = setTimeout(saveCurrentNote, 300);
    };
    window.addEventListener('beforeunload', () => {
        if (saveTimer) {
            clearTimeout(saveTimer);
            saveCurrentNote();
        }
    });
    $('#noteTitle').addEventListener('input', scheduleSave);
    $('#noteContent').addEventListener('input', () => {
        scheduleSave();
        updatePreview();
    });

    setupScrollSync();

    setupTaskToggle();

    setupDragDrop();

    window.addEventListener('resize', () => updateToolbarVisibility());
}

// ============ 编辑/预览滚动同步（电脑端双向） ============
function setupScrollSync() {
    const ta = $('#noteContent');
    const pv = $('#previewPane');
    let syncing = false;

    function syncScroll(source, target) {
        if (syncing) return;
        if (window.innerWidth <= 768) return;
        const srcMax = source.scrollHeight - source.clientHeight;
        const tgtMax = target.scrollHeight - target.clientHeight;
        if (srcMax <= 0 || tgtMax <= 0) return;
        syncing = true;
        const ratio = source.scrollTop / srcMax;
        target.scrollTop = ratio * tgtMax;
        requestAnimationFrame(() => { syncing = false; });
    }

    ta.addEventListener('scroll', () => syncScroll(ta, pv));
    pv.addEventListener('scroll', () => syncScroll(pv, ta));
}

// ============ 预览区任务列表点击回写 ============
function setupTaskToggle() {
    $('#previewPane').addEventListener('click', (e) => {
        const cb = e.target.closest('input[type="checkbox"]');
        if (!cb) return;
        const idx = [...$('#previewPane').querySelectorAll('input[type="checkbox"]')].indexOf(cb);
        if (idx >= 0) toggleTaskAt(idx);
    });
}

function toggleTaskAt(idx) {
    const ta = $('#noteContent');
    const pv = $('#previewPane');
    const lines = ta.value.split('\n');
    let seen = -1;
    let inFence = false;
    for (let i = 0; i < lines.length; i++) {
        if (/^\s*(```|~~~)/.test(lines[i])) { inFence = !inFence; continue; }
        if (inFence) continue;
        const m = lines[i].match(/^(\s*(?:[-*+]|\d+[.)])\s+\[)([ xX])(\])/);
        if (!m) continue;
        seen++;
        if (seen !== idx) continue;
        lines[i] = m[1] + (m[2] === ' ' ? 'x' : ' ') + m[3] + lines[i].slice(m[0].length);
        const scrollTop = pv.scrollTop;
        ta.value = lines.join('\n');
        ta.dispatchEvent(new Event('input', { bubbles: true }));
        pv.scrollTop = scrollTop;
        return;
    }
}

// ============ 拖拽排序（桌面） ============
function setupDragDrop() {
    const ul = $('#subjectList');
    ul.addEventListener('dragstart', (e) => {
        const li = e.target.closest('.subject-item');
        if (!li) return;
        li.classList.add('dragging');
    });
    ul.addEventListener('dragend', (e) => {
        const li = e.target.closest('.subject-item');
        if (li) li.classList.remove('dragging');
        persistSubjectOrder();
    });
    ul.addEventListener('dragover', (e) => {
        e.preventDefault();
        const dragging = ul.querySelector('.dragging');
        if (!dragging) return;
        const after = getDragAfter(ul, e.clientY);
        if (!after) ul.appendChild(dragging);
        else ul.insertBefore(dragging, after);
    });
}

function getDragAfter(ul, y) {
    const els = [...ul.querySelectorAll('.subject-item:not(.dragging)')];
    let closest = { offset: -Infinity, element: null };
    for (const el of els) {
        const box = el.getBoundingClientRect();
        const offset = y - box.top - box.height / 2;
        if (offset < 0 && offset > closest.offset) closest = { offset, element: el };
    }
    return closest.element;
}

async function persistSubjectOrder() {
    const items = [...$('#subjectList').querySelectorAll('.subject-item')];
    state.subjects.sort((a, b) => items.findIndex((i) => i.dataset.id === a.id) - items.findIndex((i) => i.dataset.id === b.id));
    for (let i = 0; i < state.subjects.length; i++) {
        state.subjects[i].order = i;
        await idbPut('subjects', state.subjects[i]);
    }
    renderSubjects();
}

// ============ 操作 ============
async function addSubject() {
    const name = await promptModal('新建科目', '科目名称，如 Python');
    if (!name || !name.trim()) return;
    const s = { id: uuid(), name: name.trim(), order: state.subjects.length };
    await idbPut('subjects', s);
    state.subjects.push(s);
    state.currentSubjectId = s.id;
    state.currentNoteId = null;
    renderSubjects();
    renderNotes();
    renderEditor();
}

async function addNote() {
    if (!state.currentSubjectId) { alert('请先创建或选择一个科目'); return; }
    const title = await promptModal('新建笔记', '笔记标题');
    if (title === null) return;

    const defaultTpl = `## 一句话总结\n\n## 笔记\n\n## 复习记录\n- ${todayStr()}：创建。\n\n## 实践\n\n## 参考\n`;
    const tpl = await getSetting('noteTemplate', defaultTpl);
    const content = tpl
        .replace(/\{\{date\}\}/g, todayStr())
        .replace(/\{\{title\}\}/g, title.trim());

    const ts = now();
    const n = {
        id: uuid(),
        subjectId: state.currentSubjectId,
        title: title.trim(),
        content,
        createdAt: ts,
        updatedAt: ts,
    };
    await idbPut('notes', n);
    state.notes.push(n);
    state.currentNoteId = n.id;
    state.editMode = true;
    $('#editToggleBtn').textContent = '预览';
    $('#editorBody').classList.remove('mode-preview');
    $('#editorBody').classList.add('mode-edit');
    renderEditor();
    $('#noteTitle').focus();
}

async function saveCurrentNote() {
    if (!state.currentNoteId) return;
    const n = state.notes.find((x) => x.id === state.currentNoteId);
    if (!n) return;
    n.title = $('#noteTitle').value;
    n.content = $('#noteContent').value;
    n.updatedAt = now();
    await idbPut('notes', n);
}

function collectOrphanAssets(noteIds) {
    const referenced = new Set();
    for (const n of state.notes) {
        if (noteIds.includes(n.id)) continue;
        for (const m of (n.content || '').matchAll(/nf:asset\/([\w-]+)/g)) referenced.add(m[1]);
    }
    const orphans = [];
    for (const id of assetMap.keys()) {
        if (!referenced.has(id)) orphans.push(id);
    }
    return orphans;
}

async function removeAssets(ids) {
    for (const id of ids) {
        if (assetMap.has(id)) {
            URL.revokeObjectURL(assetMap.get(id));
            assetMap.delete(id);
        }
        await idbDel('assets', id);
    }
}

async function deleteNote() {
    if (!state.currentNoteId) return;
    const n = state.notes.find((x) => x.id === state.currentNoteId);
    if (!n) return;
    if (!confirm(`确定删除「${n.title || '无标题'}」？`)) return;

    const orphanIds = collectOrphanAssets([n.id]);
    await removeAssets(orphanIds);

    await idbDel('notes', n.id);
    state.notes = state.notes.filter((x) => x.id !== n.id);
    state.currentNoteId = null;
    state.editMode = false;
    $('#editToggleBtn').textContent = '编辑';
    $('#editorBody').classList.remove('mode-edit');
    $('#editorBody').classList.add('mode-preview');
    renderNotes();
    renderEditor();
}

// ============ 更多菜单 ============
function handleAction(a) {
    switch (a) {
        case 'theme': return showTheme();
        case 'fontSize': return showFontSize();
        case 'toolbar': return showToolbarSettings();
        case 'defaultSubject': return showDefaultSubject();
        case 'template': return showTemplate();
        case 'renameSubject': return renameSubject();
        case 'export': return exportData();
        case 'import': return importData();
        case 'factoryReset': return factoryReset();
    }
}

async function showTheme() {
    const cur = await getSetting('theme', 'auto');
    await modal({
        title: '外观',
        bodyHTML: `<select id="themeSel">
      <option value="auto"${cur === 'auto' ? ' selected' : ''}>跟随系统</option>
      <option value="light"${cur === 'light' ? ' selected' : ''}>浅色</option>
      <option value="dark"${cur === 'dark' ? ' selected' : ''}>深色</option>
    </select>`,
        onOk: async () => {
            const v = $('#themeSel').value;
            await setSetting('theme', v);
            applyTheme(v);
        },
    });
}

function applyTheme(v) {
    let actual = v;
    if (v === 'auto') actual = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    document.documentElement.dataset.theme = actual;
}
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', async () => {
    applyTheme(await getSetting('theme', 'auto'));
});

async function showFontSize() {
    const cur = await getSetting('fontSize', 16);
    await modal({
        title: '字体大小',
        bodyHTML: `<div style="display:flex;align-items:center;gap:0.5rem;margin-top:0.5rem">
      <span style="font-size:0.8rem">A</span>
      <input type="range" id="fontRange" min="12" max="24" step="1" value="${cur}" style="flex:1">
      <span style="font-size:1.2rem">A</span>
      <span id="fontVal" style="width:3.5em;text-align:right;font-size:0.9rem">${cur}px</span>
    </div>`,
        onMount: () => {
            $('#fontRange').addEventListener('input', (e) => { $('#fontVal').textContent = e.target.value + 'px'; });
        },
        onOk: async () => {
            const v = parseInt($('#fontRange').value, 10);
            await setSetting('fontSize', v);
            applyFontSize(v);
        },
    });
}
function applyFontSize(px) {
    document.documentElement.style.setProperty('--font-size', px + 'px');
}

async function showDefaultSubject() {
    const cur = await getSetting('defaultSubjectId', '');
    const opts = state.subjects
        .map((s) => `<option value="${s.id}"${s.id === cur ? ' selected' : ''}>${escapeHtml(s.name)}</option>`)
        .join('');
    await modal({
        title: '默认科目',
        bodyHTML: `<label style="font-size:0.9rem">打开应用时默认进入的科目：</label>
      <select id="defSubjSel">
        <option value="">（无）</option>${opts}
      </select>`,
        onOk: async () => {
            const v = $('#defSubjSel').value;
            await setSetting('defaultSubjectId', v || null);
        },
    });
}

async function showTemplate() {
    const def = `## 一句话总结\n\n## 笔记\n\n## 复习记录\n- {{date}}：创建。\n\n## 实践\n\n## 参考\n`;
    const cur = await getSetting('noteTemplate', def);
    await modal({
        title: '笔记模板',
        bodyHTML: `<p style="color:var(--fg-soft);font-size:0.85rem;margin:0 0 0.5rem">
      新建笔记时的初始内容。支持变量：<code>{{date}}</code>、<code>{{title}}</code>
    </p>
    <textarea id="tplInput" spellcheck="false"></textarea>`,
        onMount: () => { $('#tplInput').value = cur; },
        onOk: async () => {
            await setSetting('noteTemplate', $('#tplInput').value);
        },
    });
}

async function renameSubject() {
    if (!state.currentSubjectId) { alert('请先选择一个科目'); return; }
    const s = state.subjects.find((x) => x.id === state.currentSubjectId);
    if (!s) return;
    const name = await promptModal('重命名科目', s.name);
    if (!name || !name.trim()) return;
    s.name = name.trim();
    await idbPut('subjects', s);
    renderSubjects();
    renderNotes();
}

// ============ 导入导出 ============
async function exportData() {
    if (state.subjects.length === 0 && state.notes.length === 0) {
        alert('没有可导出的内容');
        return;
    }

    const subjectBlocks = state.subjects.map((s) => {
        const notes = state.notes.filter((n) => n.subjectId === s.id);
        const noteItems = notes.length
            ? notes
                .map(
                    (n) => `
        <label class="export-note-item">
          <input type="checkbox" data-note-id="${n.id}" data-subject-id="${s.id}" checked>
          <span>${escapeHtml(n.title || '(无标题)')}</span>
        </label>`
                )
                .join('')
            : `<div class="export-note-item" style="color:var(--fg-soft);font-style:italic">（无笔记）</div>`;
        return `
      <div class="export-subject">
        <label class="export-subject-head">
          <input type="checkbox" data-subject-toggle="${s.id}" checked>
          <strong>${escapeHtml(s.name)}</strong>
          <span class="export-count">${notes.length}</span>
        </label>
        <div class="export-notes">${noteItems}</div>
      </div>`;
    }).join('');

    let selected = null;

    await modal({
        title: '导出数据',
        bodyHTML: `
      <p style="margin:0 0 0.6rem">选择要导出的笔记：</p>
      <div class="export-tree" id="exportTree">${subjectBlocks || '<div style="color:var(--fg-soft)">还没有科目</div>'}</div>
      <div class="export-quick">
        <button type="button" class="btn" id="exportSelectAll">全选</button>
        <button type="button" class="btn" id="exportSelectNone">全不选</button>
      </div>
    `,
        okText: '导出',
        onMount: () => {
            const tree = $('#exportTree');

            tree.addEventListener('change', (e) => {
                const t = e.target;
                if (t.dataset.subjectToggle) {
                    const sid = t.dataset.subjectToggle;
                    tree.querySelectorAll(`input[data-subject-id="${sid}"]`).forEach((cb) => {
                        cb.checked = t.checked;
                    });
                } else if (t.dataset.noteId) {
                    const sid = t.dataset.subjectId;
                    const subs = [...tree.querySelectorAll(`input[data-subject-id="${sid}"]`)];
                    const parent = tree.querySelector(`input[data-subject-toggle="${sid}"]`);
                    const anyChecked = subs.some((cb) => cb.checked);
                    const allChecked = subs.every((cb) => cb.checked);
                    parent.checked = allChecked;
                    parent.indeterminate = anyChecked && !allChecked;
                }
            });

            $('#exportSelectAll').addEventListener('click', () => {
                tree.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
                    cb.checked = true; cb.indeterminate = false;
                });
            });
            $('#exportSelectNone').addEventListener('click', () => {
                tree.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
                    cb.checked = false; cb.indeterminate = false;
                });
            });
        },
        onOk: () => {
            selected = new Set();
            document.querySelectorAll('#exportTree input[data-note-id]:checked').forEach((cb) => {
                selected.add(cb.dataset.noteId);
            });
        },
    });

    if (!selected) return;
    if (selected.size === 0) { alert('没有选择任何笔记'); return; }

    await doExport(selected);
}

async function doExport(selectedNoteIds) {
    const settingsArr = await idbAll('settings');
    const settings = {};
    for (const s of settingsArr) settings[s.key] = s.value;

    const safeName = (s) =>
        String(s || '').replace(/[\\/:*?"<>|]/g, '_').replace(/^\.+$/, '_').trim() || 'untitled';

    const enc = new TextEncoder();
    const zipFiles = {};

    // 过滤
    const notes = state.notes.filter((n) => selectedNoteIds.has(n.id));
    const subjectIds = new Set(notes.map((n) => n.subjectId));
    const subjects = state.subjects.filter((s) => subjectIds.has(s.id));

    // 找出被引用的图片
    const referenced = new Set();
    for (const n of notes) {
        for (const m of (n.content || '').matchAll(/nf:asset\/([\w-]+)/g)) referenced.add(m[1]);
    }
    const allAssets = await idbAll('assets');
    const assets = allAssets.filter((a) => referenced.has(a.id));

    // 每张图片属于哪个科目（取首次引用的科目）
    const assetSubject = new Map();
    for (const n of notes) {
        const subj = subjects.find((s) => s.id === n.subjectId);
        if (!subj) continue;
        const subjDir = safeName(subj.name);
        for (const m of (n.content || '').matchAll(/nf:asset\/([\w-]+)/g)) {
            if (!assetSubject.has(m[1])) assetSubject.set(m[1], subjDir);
        }
    }

    const meta = {
        app: 'noteforge',
        version: 3,
        exportedAt: now(),
        settings,
        subjects: subjects.map((s) => ({ id: s.id, name: s.name, order: s.order })),
        assets: [],
        notes: [],
    };

    // 打包图片：<科目>/img/<id>.<ext>
    for (const a of assets) {
        const subjDir = assetSubject.get(a.id) || '_orphan';
        const path = `${subjDir}/img/${a.id}.${a.ext}`;
        const bytes = new Uint8Array(await a.blob.arrayBuffer());
        zipFiles[path] = [bytes, { level: 0 }];
        meta.assets.push({ id: a.id, name: a.name, type: a.type, ext: a.ext, file: path });
    }

    // 打包笔记：<科目>/md/<标题>.md
    const usedPaths = new Set();
    for (const n of notes) {
        const subj = subjects.find((s) => s.id === n.subjectId);
        if (!subj) continue;
        const subjDir = safeName(subj.name);
        const baseName = safeName(n.title || 'untitled');
        let path = `${subjDir}/md/${baseName}.md`;
        let i = 2;
        while (usedPaths.has(path)) path = `${subjDir}/md/${baseName}-${i++}.md`;
        usedPaths.add(path);

        let content = n.content || '';
        content = content.replace(/nf:asset\/([\w-]+)/g, (m, id) => {
            const a = meta.assets.find((x) => x.id === id);
            return a ? `../img/${a.id}.${a.ext}` : m;
        });

        zipFiles[path] = [enc.encode(content), { level: 6 }];
        meta.notes.push({
            id: n.id,
            subjectId: n.subjectId,
            title: n.title,
            file: path,
            createdAt: n.createdAt,
            updatedAt: n.updatedAt,
        });
    }

    zipFiles['noteforge.json'] = [enc.encode(JSON.stringify(meta, null, 2)), { level: 6 }];
    zipFiles['README.txt'] = [enc.encode(readmeText(meta)), { level: 6 }];

    const zipped = fflate.zipSync(zipFiles);
    const blob = new Blob([zipped], { type: 'application/zip' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `noteforge-backup-${todayStr()}.zip`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}

function readmeText(meta) {
    return `NoteForge 导出文件
====================

导出时间：${new Date(meta.exportedAt).toLocaleString()}

目录结构：
  noteforge.json              配置与元数据
  <科目>/md/<标题>.md          该科目下的笔记（纯 Markdown）
  <科目>/img/<id>.<ext>        该科目用到的图片
  README.txt                  本文件

笔记为纯 Markdown，可用任何编辑器打开。
图片以相对路径 ../img/ 引用，保持目录结构即可本地预览。

导入时请使用未解压的 zip 文件。
也可以手动按相同目录结构整理 zip（无需 noteforge.json），
导入时应用会扫描目录，自动生成对应科目和笔记。
`;
}

function importData() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.zip,application/zip';
    input.onchange = async () => {
        const file = input.files[0];
        if (!file) return;
        try {
            const buf = new Uint8Array(await file.arrayBuffer());
            const zipFiles = fflate.unzipSync(buf);
            const dec = new TextDecoder();

            if (zipFiles['noteforge.json']) {
                await importFromBackup(zipFiles, dec);
            } else {
                await importFromManual(zipFiles, dec);
            }
        } catch (err) {
            alert('导入失败：' + err.message);
        }
    };
    input.click();
}

async function importFromBackup(zipFiles, dec) {
    const meta = JSON.parse(dec.decode(zipFiles['noteforge.json']));
    if (meta.app !== 'noteforge' || !Array.isArray(meta.subjects) || !Array.isArray(meta.notes)) {
        throw new Error('noteforge.json 格式不正确');
    }

    const assetsMeta = Array.isArray(meta.assets) ? meta.assets : [];
    const assetPathMap = new Map();
    for (const a of assetsMeta) assetPathMap.set(a.id, a.file);

    for (const a of assetsMeta) {
        const bytes = zipFiles[a.file];
        if (!bytes) continue;
        const blob = new Blob([bytes], { type: a.type || 'application/octet-stream' });
        await idbPut('assets', {
            id: a.id, name: a.name, type: a.type, ext: a.ext, blob, createdAt: now(),
        });
        if (assetMap.has(a.id)) URL.revokeObjectURL(assetMap.get(a.id));
        assetMap.set(a.id, URL.createObjectURL(blob));
    }

    const notes = [];
    let missing = 0;
    for (const n of meta.notes) {
        const raw = zipFiles[n.file];
        if (!raw) { missing++; continue; }
        let content = dec.decode(raw);
        content = content.replace(/\.\.\/img\/([\w-]+)\.\w+/g, (m, id) =>
            assetPathMap.has(id) ? `nf:asset/${id}` : m
        );
        notes.push({ ...n, content });
    }
    if (missing > 0) {
        const go = confirm(`有 ${missing} 篇笔记在 zip 中找不到对应文件，继续导入其余笔记？`);
        if (!go) return;
    }

    await handleImport({
        subjects: meta.subjects,
        notes,
        settings: meta.settings || {},
    });
}

async function importFromManual(zipFiles, dec) {
    const paths = Object.keys(zipFiles);
    const subjectsMap = new Map();

    for (const path of paths) {
        const parts = path.split('/');
        if (parts.length < 3) continue;
        const subjName = parts[0];
        const subfolder = parts[1];
        if (!subjectsMap.has(subjName)) subjectsMap.set(subjName, { notes: [], images: [] });

        if (subfolder === 'md' && path.endsWith('.md')) {
            subjectsMap.get(subjName).notes.push({
                filePath: path,
                fileName: parts[parts.length - 1],
            });
        } else if (subfolder === 'img') {
            subjectsMap.get(subjName).images.push({
                filePath: path,
                fileName: parts[parts.length - 1],
            });
        }
    }

    if (subjectsMap.size === 0) {
        throw new Error('未找到有效目录结构（应为 <科目>/md/*.md 与 <科目>/img/*）');
    }

    const ts = now();
    const newSubjects = [];
    const newNotes = [];
    let orderIdx = state.subjects.length;

    for (const [subjName, data] of subjectsMap) {
        if (data.notes.length === 0) continue;

        const subjId = uuid();
        newSubjects.push({ id: subjId, name: subjName, order: orderIdx++ });

        const imgNameToId = new Map();
        for (const img of data.images) {
            const bytes = zipFiles[img.filePath];
            if (!bytes) continue;
            const id = uuid();
            const ext = (img.fileName.match(/\.([^.]+)$/) || [, 'png'])[1].toLowerCase();
            const mime = guessMime(ext);
            const blob = new Blob([bytes], { type: mime });
            await idbPut('assets', {
                id, name: img.fileName, type: mime, ext, blob, createdAt: ts,
            });
            assetMap.set(id, URL.createObjectURL(blob));
            imgNameToId.set(img.fileName, id);
        }

        for (const n of data.notes) {
            let content = dec.decode(zipFiles[n.filePath]);
            content = content.replace(/\.\.\/img\/([^)\s]+)/g, (m, filename) => {
                const id = imgNameToId.get(filename);
                return id ? `nf:asset/${id}` : m;
            });
            content = content.replace(/!\[([^\]]*)\]\(img\/([^)]+)\)/g, (m, alt, filename) => {
                const id = imgNameToId.get(filename);
                return id ? `![${alt}](nf:asset/${id})` : m;
            });

            newNotes.push({
                id: uuid(),
                subjectId: subjId,
                title: n.fileName.replace(/\.md$/, ''),
                content,
                createdAt: ts,
                updatedAt: ts,
            });
        }
    }

    if (newSubjects.length === 0) throw new Error('未找到有效的笔记');

    await handleImport({
        subjects: newSubjects,
        notes: newNotes,
        settings: {},
    });
}

function guessMime(ext) {
    const map = {
        png: 'image/png',
        jpg: 'image/jpeg',
        jpeg: 'image/jpeg',
        gif: 'image/gif',
        webp: 'image/webp',
        svg: 'image/svg+xml',
        bmp: 'image/bmp',
        ico: 'image/x-icon',
    };
    return map[ext] || 'application/octet-stream';
}

async function handleImport(data) {
    const localSubjIds = new Set(state.subjects.map((s) => s.id));
    const localNoteIds = new Set(state.notes.map((n) => n.id));
    const subjConflicts = data.subjects.filter((s) => localSubjIds.has(s.id));
    const noteConflicts = data.notes.filter((n) => localNoteIds.has(n.id));
    let strategy = 'newest';

    if (subjConflicts.length + noteConflicts.length > 0) {
        const picked = await conflictDialog(subjConflicts, noteConflicts);
        if (picked === null) return;
        strategy = picked;
    }

    // 科目
    const subjMap = new Map(state.subjects.map((s) => [s.id, s]));
    for (const s of data.subjects) {
        const local = subjMap.get(s.id);
        if (!local) {
            await idbPut('subjects', s);
            state.subjects.push(s);
        } else if (strategy === 'overwrite') {
            Object.assign(local, s);
            await idbPut('subjects', local);
        }
    }

    // 笔记
    const noteMap = new Map(state.notes.map((n) => [n.id, n]));
    for (const n of data.notes) {
        const local = noteMap.get(n.id);
        if (!local) {
            await idbPut('notes', n);
            state.notes.push(n);
        } else if (strategy === 'overwrite' || (strategy === 'newest' && n.updatedAt > local.updatedAt)) {
            Object.assign(local, n);
            await idbPut('notes', local);
        }
    }

    // 设置
    if (data.settings && strategy !== 'skip') {
        for (const [k, v] of Object.entries(data.settings)) {
            if (v !== null && v !== undefined) await setSetting(k, v);
        }
    }

    state.subjects.sort((a, b) => a.order - b.order);
    applyFontSize(await getSetting('fontSize', 16));
    applyTheme(await getSetting('theme', 'auto'));
    renderSubjects();
    renderNotes();
    renderEditor();
    alert('导入完成');
}

function conflictDialog(subjConflicts, noteConflicts) {
    return new Promise((resolve) => {
        const listHtml = `
      ${subjConflicts.length ? `<div>科目：<ul>${subjConflicts.map((s) => `<li>${escapeHtml(s.name)}</li>`).join('')}</ul></div>` : ''}
      ${noteConflicts.length ? `<div>笔记：<ul>${noteConflicts.map((n) => `<li>${escapeHtml(n.title || '(无标题)')}</li>`).join('')}</ul></div>` : ''}
    `;
        modal({
            title: '导入冲突',
            bodyHTML: `
        <p>发现 <strong>${subjConflicts.length}</strong> 个科目、<strong>${noteConflicts.length}</strong> 篇笔记与本地重复。</p>
        <p style="color:var(--fg-soft);font-size:0.85rem;margin-bottom:0.5rem">请选择处理方式：</p>
        <div style="display:flex;flex-direction:column;gap:0.5rem">
          <label><input type="radio" name="strategy" value="newest" checked> 保留最新版本（按更新时间）</label>
          <label><input type="radio" name="strategy" value="overwrite"> 全部用导入文件覆盖</label>
          <label><input type="radio" name="strategy" value="skip"> 跳过重复，只导入新数据</label>
        </div>
        <details style="margin-top:0.75rem;font-size:0.85rem">
          <summary style="cursor:pointer;color:var(--fg-soft)">查看冲突列表</summary>
          <div style="margin-top:0.5rem">${listHtml}</div>
        </details>
      `,
            okText: '开始导入',
            onOk: () => {
                const v = document.querySelector('input[name="strategy"]:checked').value;
                resolve(v);
            },
            onCancel: () => resolve(null),
        });
    });
}

// ============ 通用模态框 ============
function modal({ title, bodyHTML, onOk, onCancel, onMount, okText, cancelText }) {
    return new Promise((resolve) => {
        $('#modalTitle').textContent = title || '';
        $('#modalBody').innerHTML = bodyHTML || '';
        $('#modalOk').textContent = okText || '确定';
        $('#modalCancel').textContent = cancelText || '取消';
        $('#modalMask').classList.remove('hidden');
        if (onMount) onMount();

        const okHandler = async () => {
            if (onOk) await onOk();
            close();
            resolve(true);
        };
        const cancelHandler = () => {
            if (onCancel) onCancel();
            close();
            resolve(false);
        };
        const close = () => {
            $('#modalMask').classList.add('hidden');
            $('#modalOk').removeEventListener('click', okHandler);
            $('#modalCancel').removeEventListener('click', cancelHandler);
            $('#modalClose').removeEventListener('click', cancelHandler);
        };
        $('#modalOk').addEventListener('click', okHandler);
        $('#modalCancel').addEventListener('click', cancelHandler);
        $('#modalClose').addEventListener('click', cancelHandler);
    });
}

function promptModal(title, placeholder) {
    return new Promise((resolve) => {
        let value = '';
        modal({
            title,
            bodyHTML: `<input type="text" id="promptInput" placeholder="${escapeHtml(placeholder || '')}">`,
            onMount: () => {
                const inp = $('#promptInput');
                inp.focus();
                inp.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') $('#modalOk').click();
                });
            },
            onOk: () => { value = $('#promptInput').value; },
        }).then((ok) => resolve(ok ? value : null));
    });
}

// ============ Service Worker ============
function registerSW() {
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('sw.js').catch(() => { });
        });
    }
}

// ============ 选择模式 ============
function enterSelectionMode() {
    if (!state.currentSubjectId) {
        alert('请先选择一个科目');
        return;
    }
    state.selectionMode = true;
    state.selectedNoteIds.clear();
    renderNotes();
}

function exitSelectionMode() {
    state.selectionMode = false;
    state.selectedNoteIds.clear();
    renderNotes();
}

function updateSelectionUI() {
    $('#noteListViewHead').classList.toggle('hidden', state.selectionMode);
    $('#selectionHead').classList.toggle('hidden', !state.selectionMode);
    $('#selectionActions').classList.toggle('hidden', !state.selectionMode);
    $('#selectedCount').textContent = `已选 ${state.selectedNoteIds.size} 项`;
}

function toggleSelectAll() {
    const subj = state.subjects.find((s) => s.id === state.currentSubjectId);
    if (!subj) return;
    const notes = state.notes.filter((n) => n.subjectId === subj.id);
    const allSelected = notes.length > 0 && notes.every((n) => state.selectedNoteIds.has(n.id));
    if (allSelected) {
        state.selectedNoteIds.clear();
    } else {
        for (const n of notes) state.selectedNoteIds.add(n.id);
    }
    renderNotes();
}

// ============ 移动 / 删除选中笔记 ============
async function moveSelected() {
    if (state.selectedNoteIds.size === 0) {
        alert('请先选择要移动的笔记');
        return;
    }
    const others = state.subjects.filter((s) => s.id !== state.currentSubjectId);
    if (others.length === 0) {
        alert('没有其他科目可以移动，请先新建一个科目');
        return;
    }

    const opts = others
        .map((s) => `<option value="${s.id}">${escapeHtml(s.name)}</option>`)
        .join('');

    let targetId = others[0].id;
    const ok = await modal({
        title: '移动笔记',
        bodyHTML: `
      <p style="margin-top:0">将选中的 <strong>${state.selectedNoteIds.size}</strong> 篇笔记移动到：</p>
      <select id="moveTargetSel">${opts}</select>
    `,
        onMount: () => {
            targetId = $('#moveTargetSel').value;
            $('#moveTargetSel').addEventListener('change', (e) => { targetId = e.target.value; });
        },
        okText: '移动',
    });
    if (!ok) return;

    const ids = [...state.selectedNoteIds];
    for (const id of ids) {
        const n = state.notes.find((x) => x.id === id);
        if (n) {
            n.subjectId = targetId;
            n.updatedAt = now();
            await idbPut('notes', n);
        }
    }
    exitSelectionMode();
}

async function deleteSelected() {
    if (state.selectedNoteIds.size === 0) {
        alert('请先选择要删除的笔记');
        return;
    }
    const count = state.selectedNoteIds.size;
    const ok = await confirmModal(
        '删除笔记',
        `确定删除选中的 ${count} 篇笔记？此操作不可撤销。`,
        '删除',
        '取消'
    );
    if (!ok) return;

    const ids = [...state.selectedNoteIds];

    const orphanIds = collectOrphanAssets(ids);
    await removeAssets(orphanIds);

    for (const id of ids) {
        await idbDel('notes', id);
    }
    state.notes = state.notes.filter((n) => !ids.includes(n.id));

    if (state.currentNoteId && ids.includes(state.currentNoteId)) {
        state.currentNoteId = null;
        state.editMode = false;
        $('#editToggleBtn').textContent = '编辑';
        $('#editorBody').classList.remove('mode-edit');
        $('#editorBody').classList.add('mode-preview');
    }

    exitSelectionMode();
    renderEditor();
}

// ============ 科目选择模式 ============
function enterSubjectSelectionMode() {
    state.subjectSelectionMode = true;
    state.selectedSubjectIds.clear();
    renderSubjects();
}

function exitSubjectSelectionMode() {
    state.subjectSelectionMode = false;
    state.selectedSubjectIds.clear();
    renderSubjects();
}

function updateSubjectSelectionUI() {
    $('#sidebarHead').classList.toggle('hidden', state.subjectSelectionMode);
    $('#subjectSelectionHead').classList.toggle('hidden', !state.subjectSelectionMode);
    $('#subjectSelectionActions').classList.toggle('hidden', !state.subjectSelectionMode);
    $('#selectedSubjectCount').textContent = `已选 ${state.selectedSubjectIds.size} 项`;
}

function toggleSelectAllSubjects() {
    const allSelected = state.subjects.length > 0 && state.subjects.every((s) => state.selectedSubjectIds.has(s.id));
    if (allSelected) {
        state.selectedSubjectIds.clear();
    } else {
        for (const s of state.subjects) state.selectedSubjectIds.add(s.id);
    }
    renderSubjects();
}

async function deleteSelectedSubjects() {
    if (state.selectedSubjectIds.size === 0) {
        alert('请先选择要删除的科目');
        return;
    }
    const count = state.selectedSubjectIds.size;
    const notesCount = state.notes.filter((n) => state.selectedSubjectIds.has(n.subjectId)).length;
    const msg = notesCount > 0
        ? `确定删除选中的 ${count} 个科目？\n\n这将同时删除其下的 ${notesCount} 篇笔记，此操作不可撤销。`
        : `确定删除选中的 ${count} 个空科目？此操作不可撤销。`;
    const ok = await confirmModal('删除科目', msg, '删除', '取消');
    if (!ok) return;

    const ids = [...state.selectedSubjectIds];
    const affectedNotes = state.notes.filter((n) => ids.includes(n.subjectId));
    const orphanIds = collectOrphanAssets(affectedNotes.map((n) => n.id));
    await removeAssets(orphanIds);

    for (const id of ids) {
        const notes = state.notes.filter((n) => n.subjectId === id);
        for (const n of notes) await idbDel('notes', n.id);
        await idbDel('subjects', id);
    }
    state.notes = state.notes.filter((n) => !ids.includes(n.subjectId));
    state.subjects = state.subjects.filter((s) => !ids.includes(s.id));
    state.subjects.forEach((s, i) => { s.order = i; });
    for (const s of state.subjects) await idbPut('subjects', s);

    if (ids.includes(state.currentSubjectId)) {
        state.currentSubjectId = state.subjects.length > 0 ? state.subjects[0].id : null;
        state.currentNoteId = null;
        state.editMode = false;
        $('#editToggleBtn').textContent = '编辑';
        $('#editorBody').classList.remove('mode-edit');
        $('#editorBody').classList.add('mode-preview');
    }

    const defId = await getSetting('defaultSubjectId', null);
    if (defId && ids.includes(defId)) await setSetting('defaultSubjectId', null);

    exitSubjectSelectionMode();
    renderNotes();
    renderEditor();
}

// ============ 删除科目 ============
async function deleteSubject() {
    if (!state.currentSubjectId) {
        alert('请先选择一个科目');
        return;
    }
    const subj = state.subjects.find((s) => s.id === state.currentSubjectId);
    if (!subj) return;

    const notes = state.notes.filter((n) => n.subjectId === subj.id);

    if (notes.length === 0) {
        const ok = await confirmModal(
            '删除科目',
            `确定删除空科目「${subj.name}」？`,
            '删除',
            '取消'
        );
        if (!ok) return;
        await doDeleteSubject(subj, []);
        return;
    }

    const ok = await confirmModal(
        '删除科目',
        `科目「${subj.name}」下还有 ${notes.length} 篇笔记。\n\n删除科目会同时删除这些笔记，此操作不可撤销。\n\n确定要级联删除吗？`,
        '删除科目和笔记',
        '取消'
    );
    if (!ok) return;
    await doDeleteSubject(subj, notes);
}

async function doDeleteSubject(subj, notesToDelete) {
    const orphanIds = collectOrphanAssets(notesToDelete.map((n) => n.id));
    await removeAssets(orphanIds);

    for (const n of notesToDelete) {
        await idbDel('notes', n.id);
    }
    await idbDel('subjects', subj.id);

    state.notes = state.notes.filter((n) => n.subjectId !== subj.id);
    state.subjects = state.subjects.filter((s) => s.id !== subj.id);
    state.subjects.forEach((s, i) => { s.order = i; });
    for (const s of state.subjects) await idbPut('subjects', s);

    if (state.subjects.length > 0) {
        state.currentSubjectId = state.subjects[0].id;
    } else {
        state.currentSubjectId = null;
    }
    state.currentNoteId = null;
    state.selectionMode = false;
    state.selectedNoteIds.clear();
    state.editMode = false;
    $('#editToggleBtn').textContent = '编辑';
    $('#editorBody').classList.remove('mode-edit');
    $('#editorBody').classList.add('mode-preview');

    const defId = await getSetting('defaultSubjectId', null);
    if (defId === subj.id) await setSetting('defaultSubjectId', null);

    renderSubjects();
    renderNotes();
    renderEditor();
}

// ============ 确认对话框 ============
function confirmModal(title, message, okText = '确定', cancelText = '取消') {
    return modal({
        title,
        bodyHTML: `<p style="white-space:pre-wrap;margin:0">${escapeHtml(message)}</p>`,
        okText,
        cancelText,
    });
}

// ============ 恢复出厂设置 ============
async function factoryReset() {
    const ok = await confirmModal(
        '恢复出厂设置',
        '将清除所有科目、笔记、图片和设置，恢复到初始状态。\n\n此操作不可撤销，建议先导出数据备份。',
        '恢复',
        '取消'
    );
    if (!ok) return;

    for (const a of assetMap.values()) URL.revokeObjectURL(a);
    assetMap.clear();

    db.close();
    await new Promise((res, rej) => {
        const r = indexedDB.deleteDatabase('noteforge');
        r.onsuccess = res;
        r.onerror = () => rej(r.error);
    });
    location.reload();
}

// ============ 工具栏 ============
const TOOLBAR_DEFS = [
    { id: 'T',  label: 'T',  name: '标题',   defaultKey: 'Ctrl+1' },
    { id: 'B',  label: 'B',  name: '加粗',   defaultKey: 'Ctrl+B' },
    { id: 'I',  label: 'I',  name: '倾斜',   defaultKey: 'Ctrl+I' },
    { id: 'S',  label: 'S',  name: '删除线', defaultKey: 'Ctrl+D' },
    { id: 'L',  label: 'L',  name: '链接/图片', defaultKey: 'Ctrl+K' },
    { id: 'UL', label: 'UL', name: '无序列表', defaultKey: 'Ctrl+Shift+U' },
    { id: 'OL', label: 'OL', name: '有序列表', defaultKey: 'Ctrl+Shift+O' },
    { id: 'TL', label: 'TL', name: '任务列表', defaultKey: 'Ctrl+Shift+T' },
    { id: 'C',  label: 'C',  name: '表格',   defaultKey: 'Ctrl+Shift+C' },
    { id: 'R',  label: 'R',  name: '引用',   defaultKey: 'Ctrl+Shift+Q' },
    { id: 'CB', label: 'CB', name: '代码块', defaultKey: 'Ctrl+Shift+E' },
    { id: 'UN', label: 'UN', name: '撤销',   defaultKey: 'Ctrl+Z' },
    { id: 'RE', label: 'RE', name: '重做',   defaultKey: 'Ctrl+Y' },
];

let tbMode = 'bar';
let tbHidden = false;
let tbKeys = {};
let dialPage = 0;
let dialPos = { right: 80, bottom: 120 };
const DIAL_PER_PAGE = 6;

async function initToolbar() {
    tbMode = await getSetting('tbMode', 'bar');
    tbHidden = await getSetting('tbHidden', false);
    const savedKeys = await getSetting('tbKeys', null);
    tbKeys = {};
    for (const d of TOOLBAR_DEFS) tbKeys[d.id] = d.defaultKey;
    if (savedKeys) Object.assign(tbKeys, savedKeys);
    const savedPos = await getSetting('tbDialPos', null);
    if (savedPos) dialPos = savedPos;

    renderToolbarButtons();
    setupShortcuts();
    setupDial();
    setupMobileKB();
    updateToolbarVisibility();
}

function renderToolbarButtons() {
    const containers = ['toolbarInline', 'toolbarMobileBar'];
    for (const cid of containers) {
        const el = document.getElementById(cid);
        el.innerHTML = '';
        for (const d of TOOLBAR_DEFS) {
            const btn = document.createElement('button');
            btn.className = 'tb';
            btn.dataset.toolId = d.id;
            btn.dataset.tip = d.name + (tbKeys[d.id] ? ' (' + tbKeys[d.id] + ')' : '');
            btn.innerHTML = `<span>${d.label}</span><span class="tb-sub">${d.name}</span>`;
            btn.addEventListener('click', () => handleToolbarAction(d.id, btn));
            el.appendChild(btn);
        }
    }
}

function handleToolbarAction(id, btnEl) {
    if (!state.currentNoteId) { alert('请先进入一篇笔记'); return; }
    const ta = $('#noteContent');
    if (!state.editMode) {
        state.editMode = true;
        $('#editToggleBtn').textContent = '预览';
        $('#editorBody').classList.remove('mode-preview');
        $('#editorBody').classList.add('mode-edit');
        ta.focus();
    }

    switch (id) {
        case 'T': tbHeading(); break;
        case 'B': wrapSel('**', '**', '粗体文字'); break;
        case 'I': wrapSel('*', '*', '斜体文字'); break;
        case 'S': wrapSel('~~', '~~', '删除线文字'); break;
        case 'L': showLinkPopup(btnEl); break;
        case 'UL': toggleLinePrefix('- '); break;
        case 'OL': toggleLinePrefix('1. '); break;
        case 'TL': toggleLinePrefix('- [ ] '); break;
        case 'C': insertBlock('\n| 列1 | 列2 | 列3 |\n| --- | --- | --- |\n| 内容 | 内容 | 内容 |\n'); break;
        case 'R': toggleLinePrefix('> '); break;
        case 'CB': insertBlock('\n```\n代码\n```\n'); break;
        case 'UN': document.execCommand('undo'); break;
        case 'RE': document.execCommand('redo'); break;
    }
}

function tbHeading() {
    const ta = $('#noteContent');
    const start = ta.selectionStart;
    const val = ta.value;
    const lineStart = val.lastIndexOf('\n', start - 1) + 1;
    const lineEnd = val.indexOf('\n', start);
    const line = val.substring(lineStart, lineEnd === -1 ? val.length : lineEnd);
    const match = line.match(/^(#{1,6})\s/);
    let newLine, cursorOffset;
    if (!match) {
        newLine = '# ' + line;
        cursorOffset = 2;
    } else if (match[1].length >= 6) {
        newLine = line.replace(/^#{1,6}\s/, '');
        cursorOffset = -(match[1].length + 1);
    } else {
        newLine = '#' + line;
        cursorOffset = 1;
    }
    const end = lineEnd === -1 ? val.length : lineEnd;
    ta.value = val.substring(0, lineStart) + newLine + val.substring(end);
    ta.selectionStart = ta.selectionEnd = Math.max(lineStart, start + cursorOffset);
    ta.dispatchEvent(new Event('input'));
    ta.focus();
}

function wrapSel(before, after, placeholder) {
    const ta = $('#noteContent');
    ta.focus();
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const val = ta.value;
    const selected = val.substring(start, end);
    if (selected) {
        const wrapped = before + selected + after;
        ta.value = val.substring(0, start) + wrapped + val.substring(end);
        ta.selectionStart = start + before.length;
        ta.selectionEnd = start + before.length + selected.length;
    } else {
        const text = before + placeholder + after;
        ta.value = val.substring(0, start) + text + val.substring(end);
        ta.selectionStart = start + before.length;
        ta.selectionEnd = start + before.length + placeholder.length;
    }
    ta.dispatchEvent(new Event('input'));
}

function toggleLinePrefix(prefix) {
    const ta = $('#noteContent');
    ta.focus();
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const val = ta.value;
    const lineStart = val.lastIndexOf('\n', start - 1) + 1;
    const lineEnd = val.indexOf('\n', end);
    const blockEnd = lineEnd === -1 ? val.length : lineEnd;
    const block = val.substring(lineStart, blockEnd);
    const lines = block.split('\n');
    const allHave = lines.every(l => l.startsWith(prefix));
    const newLines = lines.map(l => {
        if (allHave) return l.substring(prefix.length);
        const existing = l.match(/^(#{1,6}\s|>\s|- \[[ x]\] |- |\d+\. )/);
        if (existing && prefix !== '## ') return l.substring(existing[0].length);
        return prefix + l;
    });
    const newBlock = newLines.join('\n');
    ta.value = val.substring(0, lineStart) + newBlock + val.substring(blockEnd);
    ta.selectionStart = lineStart;
    ta.selectionEnd = lineStart + newBlock.length;
    ta.dispatchEvent(new Event('input'));
}

function insertBlock(text) {
    const ta = $('#noteContent');
    ta.focus();
    const start = ta.selectionStart;
    const val = ta.value;
    ta.value = val.substring(0, start) + text + val.substring(start);
    ta.selectionStart = ta.selectionEnd = start + text.length;
    ta.dispatchEvent(new Event('input'));
}

function showLinkPopup(btnEl) {
    closeLinkPopup();
    const popup = document.createElement('div');
    popup.className = 'link-popup';
    popup.id = 'linkPopup';
    const btnLink = document.createElement('button');
    btnLink.textContent = '插入链接';
    btnLink.addEventListener('click', () => { closeLinkPopup(); insertLink(); });
    const btnImg = document.createElement('button');
    btnImg.textContent = '插入图片';
    btnImg.addEventListener('click', () => { closeLinkPopup(); insertImage(); });
    popup.append(btnLink, btnImg);
    document.body.appendChild(popup);

    let top, left;
    if (btnEl) {
        const rect = btnEl.getBoundingClientRect();
        top = rect.bottom + 4;
        left = rect.left + rect.width / 2 - 70;
    } else {
        const ta = $('#noteContent');
        const taRect = ta.getBoundingClientRect();
        top = taRect.top + 60;
        left = taRect.left + taRect.width / 2 - 70;
    }
    if (left < 8) left = 8;
    if (left + 140 > window.innerWidth) left = window.innerWidth - 148;
    if (top + 100 > window.innerHeight) top = (btnEl ? btnEl.getBoundingClientRect().top : $('#noteContent').getBoundingClientRect().top) - 100;
    popup.style.top = top + 'px';
    popup.style.left = left + 'px';

    setTimeout(() => {
        document.addEventListener('click', closeLinkPopupOutside, { once: true });
    }, 10);
}

function closeLinkPopup() {
    const el = document.getElementById('linkPopup');
    if (el) el.remove();
}

function closeLinkPopupOutside(e) {
    const popup = document.getElementById('linkPopup');
    if (popup && !popup.contains(e.target)) popup.remove();
}

async function insertLink() {
    if (!state.currentNoteId) return;
    const ta = $('#noteContent');
    const sel = ta.value.substring(ta.selectionStart, ta.selectionEnd);
    const url = await promptModal('插入链接', 'https://example.com');
    if (!url) return;
    const text = sel || '链接文字';
    const md = `[${text}](${url})`;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    ta.value = ta.value.substring(0, start) + md + ta.value.substring(end);
    ta.selectionStart = start;
    ta.selectionEnd = start + md.length;
    ta.dispatchEvent(new Event('input'));
    ta.focus();
}

async function insertImage() {
    if (!state.currentNoteId) { alert('请先进入一篇笔记'); return; }
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.multiple = true;
    input.onchange = async () => {
        const ta = $('#noteContent');
        for (const file of input.files) {
            const id = uuid();
            const ext = (file.name.match(/\.([^.]+)$/) || [, 'png'])[1].toLowerCase();
            const asset = {
                id,
                name: file.name,
                type: file.type,
                ext,
                blob: file,
                createdAt: now(),
            };
            await idbPut('assets', asset);
            if (assetMap.has(id)) URL.revokeObjectURL(assetMap.get(id));
            assetMap.set(id, URL.createObjectURL(file));

            const md = `![${file.name}](nf:asset/${id})`;
            const start = ta.selectionStart;
            const end = ta.selectionEnd;
            ta.value = ta.value.slice(0, start) + md + ta.value.slice(end);
            ta.selectionStart = ta.selectionEnd = start + md.length;
        }
        ta.dispatchEvent(new Event('input'));
        ta.focus();
    };
    input.click();
}

function parseKeyCombo(str) {
    const parts = str.toLowerCase().split('+').map(s => s.trim());
    return {
        ctrl: parts.includes('ctrl'),
        shift: parts.includes('shift'),
        alt: parts.includes('alt'),
        key: parts.filter(p => !['ctrl', 'shift', 'alt'].includes(p))[0] || '',
    };
}

function matchesKey(e, combo) {
    if (!combo || !combo.key) return false;
    if (e.ctrlKey !== combo.ctrl) return false;
    if (e.shiftKey !== combo.shift) return false;
    if (e.altKey !== combo.alt) return false;
    return e.key.toLowerCase() === combo.key;
}

function setupShortcuts() {
    document.addEventListener('keydown', (e) => {
        if (!state.currentNoteId) return;
        if (!$('#editorView') || $('#editorView').classList.contains('hidden')) return;
        const ta = $('#noteContent');
        if (document.activeElement !== ta && !e.ctrlKey) return;

        for (const d of TOOLBAR_DEFS) {
            const combo = parseKeyCombo(tbKeys[d.id]);
            if (matchesKey(e, combo)) {
                e.preventDefault();
                if (['UN', 'RE'].includes(d.id)) {
                    handleToolbarAction(d.id, null);
                } else {
                    if (!state.editMode) {
                        state.editMode = true;
                        $('#editToggleBtn').textContent = '预览';
                        $('#editorBody').classList.remove('mode-preview');
                        $('#editorBody').classList.add('mode-edit');
                        ta.focus();
                        updateToolbarVisibility();
                    }
                    handleToolbarAction(d.id, null);
                }
                return;
            }
        }
    });
}

function setupDial() {
    const dial = $('#toolbarDial');
    const trigger = $('#dialTrigger');
    let isOpen = false;
    let longPressTimer = null;
    let isDragging = false;

    const totalPages = () => Math.ceil(TOOLBAR_DEFS.length / DIAL_PER_PAGE);

    function changePage(delta) {
        const tp = totalPages();
        const next = dialPage + delta;
        if (next >= 0 && next < tp) { dialPage = next; renderDialItems(true); }
    }

    function updateTriggerTip() {
        const tp = totalPages();
        trigger.title = tp > 1 ? `${dialPage + 1}/${tp} 滚轮翻页` : '工具圆盘';
    }
    updateTriggerTip();

    trigger.addEventListener('click', () => {
        if (isDragging) return;
        isOpen = !isOpen;
        dial.classList.toggle('open', isOpen);
        if (isOpen) renderDialItems();
    });

    trigger.addEventListener('pointerdown', (e) => {
        isDragging = false;
        longPressTimer = setTimeout(() => {
            isDragging = true;
            trigger.classList.add('dragging');
            const moveHandler = (ev) => {
                const x = ev.clientX;
                const y = ev.clientY;
                dialPos.right = Math.max(0, window.innerWidth - x - 24);
                dialPos.bottom = Math.max(0, window.innerHeight - y - 24);
                applyDialPos();
            };
            const upHandler = () => {
                document.removeEventListener('pointermove', moveHandler);
                document.removeEventListener('pointerup', upHandler);
                trigger.classList.remove('dragging');
                setSetting('tbDialPos', dialPos);
                setTimeout(() => { isDragging = false; }, 100);
            };
            document.addEventListener('pointermove', moveHandler);
            document.addEventListener('pointerup', upHandler);
        }, 300);
    });

    trigger.addEventListener('pointerup', () => {
        clearTimeout(longPressTimer);
    });

    trigger.addEventListener('wheel', (e) => {
        e.preventDefault();
        changePage(e.deltaY > 0 ? 1 : -1);
        updateTriggerTip();
    }, { passive: false });

    applyDialPos();

    const itemsContainer = $('#dialItems');
    let touchStartY = 0;
    itemsContainer.addEventListener('touchstart', (e) => {
        touchStartY = e.touches[0].clientY;
    });
    itemsContainer.addEventListener('touchend', (e) => {
        const dy = e.changedTouches[0].clientY - touchStartY;
        if (dy < -30) changePage(1);
        else if (dy > 30) changePage(-1);
    });
    itemsContainer.addEventListener('wheel', (e) => {
        e.preventDefault();
        changePage(e.deltaY > 0 ? 1 : -1);
    }, { passive: false });
}

function applyDialPos() {
    const dial = $('#toolbarDial');
    dial.style.right = dialPos.right + 'px';
    dial.style.bottom = dialPos.bottom + 'px';
}

function renderDialItems(animate) {
    const container = $('#dialItems');
    container.innerHTML = '';
    const start = dialPage * DIAL_PER_PAGE;
    const pageItems = TOOLBAR_DEFS.slice(start, start + DIAL_PER_PAGE);
    const angleStep = 360 / Math.max(pageItems.length, 1);
    const radius = 64;

    for (let i = 0; i < pageItems.length; i++) {
        const d = pageItems[i];
        const angle = (angleStep * i - 90) * (Math.PI / 180);
        const x = Math.cos(angle) * radius;
        const y = Math.sin(angle) * radius;
        const btn = document.createElement('button');
        btn.className = 'dial-item' + (animate ? ' rotate-in' : '');
        btn.textContent = d.label;
        btn.title = d.name;
        btn.style.left = x + 'px';
        btn.style.top = y + 'px';
        btn.style.transitionDelay = (i * 30) + 'ms';
        if (animate) btn.style.animationDelay = (i * 30) + 'ms';
        btn.addEventListener('click', () => {
            handleToolbarAction(d.id, btn);
            $('#toolbarDial').classList.remove('open');
        });
        container.appendChild(btn);
    }
}

function setupMobileKB() {
    if (!window.visualViewport) return;
    const bar = $('#toolbarMobileBar');
    const vv = window.visualViewport;

    const update = () => {
        if (tbMode !== 'bar' || tbHidden) return;
        if (!state.currentNoteId) return;
        const kbVisible = vv.height < window.innerHeight - 50;
        if (kbVisible && state.editMode) {
            bar.classList.remove('hidden');
            bar.style.bottom = (window.innerHeight - vv.height - vv.offsetTop) + 'px';
        } else {
            bar.classList.add('hidden');
        }
    };

    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
}

function updateToolbarVisibility() {
    const inline = $('#toolbarInline');
    const mobileBar = $('#toolbarMobileBar');
    const dial = $('#toolbarDial');
    const inEditor = state.currentNoteId && !$('#editorView').classList.contains('hidden');
    const isDesktop = window.innerWidth > 768;
    const showToolbar = isDesktop ? inEditor : (inEditor && state.editMode);

    inline.classList.toggle('active', showToolbar && !tbHidden && tbMode === 'bar');
    dial.classList.toggle('hidden', tbHidden || tbMode !== 'dial' || !showToolbar);
    if (!showToolbar) {
        mobileBar.classList.add('hidden');
    }
}

async function showToolbarSettings() {
    const mode = await getSetting('tbMode', 'bar');
    const hidden = await getSetting('tbHidden', false);
    const savedKeys = await getSetting('tbKeys', {});
    const keys = { ...Object.fromEntries(TOOLBAR_DEFS.map(d => [d.id, d.defaultKey])), ...savedKeys };

    const rows = TOOLBAR_DEFS.map(d => `
        <div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.4rem">
            <span style="width:2.5rem;font-weight:700;font-size:0.8rem">${d.label}</span>
            <span style="flex:1;font-size:0.85rem">${d.name}</span>
            <input type="text" class="tb-key-input" data-tool="${d.id}" value="${keys[d.id] || ''}"
                style="width:8rem;padding:0.3rem 0.5rem;border:1px solid var(--border);border-radius:var(--radius-sm);font-size:0.8rem;background:var(--bg);color:var(--fg)">
        </div>
    `).join('');

    await modal({
        title: '工具栏设置',
        bodyHTML: `
            <div style="margin-bottom:0.8rem">
                <label style="font-size:0.9rem;display:block;margin-bottom:0.4rem">显示形式</label>
                <div style="display:flex;gap:1rem">
                    <label style="font-size:0.85rem"><input type="radio" name="tbMode" value="bar" ${mode === 'bar' ? 'checked' : ''}> 横向长栏</label>
                    <label style="font-size:0.85rem"><input type="radio" name="tbMode" value="dial" ${mode === 'dial' ? 'checked' : ''}> Tab 圆盘</label>
                </div>
            </div>
            <div style="margin-bottom:0.8rem">
                <label style="font-size:0.85rem"><input type="checkbox" id="tbHideChk" ${hidden ? 'checked' : ''}> 隐藏工具栏</label>
            </div>
            <details style="font-size:0.85rem">
                <summary style="cursor:pointer;margin-bottom:0.5rem">快捷键设置</summary>
                <p style="color:var(--fg-soft);font-size:0.8rem;margin:0 0 0.5rem">点击输入框后按下组合键（如 Ctrl+B）</p>
                ${rows}
            </details>
        `,
        onMount: () => {
            document.querySelectorAll('.tb-key-input').forEach(inp => {
                inp.addEventListener('keydown', (e) => {
                    e.preventDefault();
                    const parts = [];
                    if (e.ctrlKey) parts.push('Ctrl');
                    if (e.shiftKey) parts.push('Shift');
                    if (e.altKey) parts.push('Alt');
                    if (!['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) {
                        parts.push(e.key.length === 1 ? e.key.toUpperCase() : e.key);
                    }
                    if (parts.length > 0 && !['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) {
                        inp.value = parts.join('+');
                    }
                });
            });
        },
        onOk: async () => {
            const newMode = document.querySelector('input[name="tbMode"]:checked').value;
            const newHidden = $('#tbHideChk').checked;
            const newKeys = {};
            document.querySelectorAll('.tb-key-input').forEach(inp => {
                newKeys[inp.dataset.tool] = inp.value;
            });
            await setSetting('tbMode', newMode);
            await setSetting('tbHidden', newHidden);
            await setSetting('tbKeys', newKeys);
            tbMode = newMode;
            tbHidden = newHidden;
            tbKeys = { ...tbKeys, ...newKeys };
            renderToolbarButtons();
            updateToolbarVisibility();
        },
    });
}

// ============ 启动 ============
init().catch((err) => {
    console.error(err);
    alert('初始化失败：' + err.message);
});