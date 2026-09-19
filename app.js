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

// ============ 状态 ============
const assetMap = new Map(); // assetId -> blob URL，用于渲染时同步查找
const state = {
    subjects: [],
    notes: [],
    currentSubjectId: null,
    currentNoteId: null,
    editMode: false,
};

// ============ 初始化 ============
async function init() {
    db = await openDB();
    await loadAllAssets();
    state.subjects = (await idbAll('subjects')).sort((a, b) => a.order - b.order);
    state.notes = await idbAll('notes');

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
    registerSW();
}

async function loadAllAssets() {
    const assets = await idbAll('assets');
    for (const a of assets) {
        if (!assetMap.has(a.id)) assetMap.set(a.id, URL.createObjectURL(a.blob));
    }
}

// ============ 渲染 ============
function renderSubjects() {
    const ul = $('#subjectList');
    ul.innerHTML = '';
    for (const s of state.subjects) {
        const li = document.createElement('li');
        li.className = 'subject-item' + (s.id === state.currentSubjectId ? ' active' : '');
        li.dataset.id = s.id;
        li.draggable = true;
        const span = document.createElement('span');
        span.className = 'subject-name';
        span.textContent = s.name;
        li.appendChild(span);
        ul.appendChild(li);
    }
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
        return;
    }
    const notes = state.notes
        .filter((n) => n.subjectId === subj.id)
        .sort((a, b) => b.updatedAt - a.updatedAt);
    if (notes.length === 0) {
        emptyEl.textContent = '还没有笔记，点击右上角 + 新建一篇';
        emptyEl.style.display = 'block';
        return;
    }
    emptyEl.style.display = 'none';
    for (const n of notes) {
        const li = document.createElement('li');
        li.className = 'note-item';
        li.dataset.id = n.id;
        const t = document.createElement('div');
        t.className = 'note-item-title';
        t.textContent = n.title || '(无标题)';
        const m = document.createElement('div');
        m.className = 'note-item-meta';
        m.textContent = formatDate(n.updatedAt);
        li.append(t, m);
        ul.appendChild(li);
    }
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
            return;
        }
    }
    $('#noteListView').classList.remove('hidden');
    $('#editorView').classList.add('hidden');
}

// ============ Markdown 渲染（极简版） ============
function renderMarkdown(md) {
    let s = escapeHtml(md);
    s = s.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, __, code) => `<pre><code>${code.replace(/\n$/, '')}</code></pre>`);
    s = s.replace(/`([^`\n]+)`/g, '<code>$1</code>');
    s = s.replace(/^###### (.+)$/gm, '<h6>$1</h6>');
    s = s.replace(/^##### (.+)$/gm, '<h5>$1</h5>');
    s = s.replace(/^#### (.+)$/gm, '<h4>$1</h4>');
    s = s.replace(/^### (.+)$/gm, '<h3>$1</h3>');
    s = s.replace(/^## (.+)$/gm, '<h2>$1</h2>');
    s = s.replace(/^# (.+)$/gm, '<h1>$1</h1>');
    s = s.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/(?<![*\w])\*([^*\n]+)\*(?!\w)/g, '<em>$1</em>');
    // 先处理 NoteForge 内部图片引用 nf:asset/<id>
    s = s.replace(/!\[([^\]]*)\]\(nf:asset\/([\w-]+)\)/g, (m, alt, id) => {
        const url = assetMap.get(id);
        if (url) return `<img alt="${escapeHtml(alt)}" src="${url}">`;
        return `<span style="color:#c33">[图片丢失:${id}]</span>`;
    });
    s = s.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img alt="$1" src="$2">');
    s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    s = s.replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>');
    s = s.replace(/^---+$/gm, '<hr>');

    // 列表
    s = s.replace(/^- (.+)$/gm, '<li>$1</li>');
    s = s.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');
    s = s.replace(/(?:<li>[\s\S]*?<\/li>\n?)+/g, (m) => `<ul>${m}</ul>`);

    // 段落
    const out = [];
    for (const line of s.split('\n')) {
        if (!line.trim()) { out.push(''); continue; }
        if (/^<(h\d|ul|ol|li|pre|blockquote|hr|p|img|div)/i.test(line) || /^<\/(h\d|ul|ol|blockquote|pre)/i.test(line)) {
            out.push(line);
        } else {
            out.push(`<p>${line}</p>`);
        }
    }
    return out.join('\n');
}

function updatePreview() {
    $('#previewPane').innerHTML = renderMarkdown($('#noteContent').value);
}

// ============ 事件 ============
function bindEvents() {

    $('#insertImageBtn').addEventListener('click', insertImage);

    $('#menuBtn').addEventListener('click', () => {
        if (window.innerWidth <= 768) {
            $('#sidebar').classList.toggle('open');
            $('#overlay').classList.toggle('hidden');
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

    $('#deleteNoteBtn').addEventListener('click', deleteNote);
    $('#backBtn').addEventListener('click', () => {
        state.currentNoteId = null;
        state.editMode = false;
        $('#editToggleBtn').textContent = '编辑';
        $('#editorBody').classList.remove('mode-edit');
        $('#editorBody').classList.add('mode-preview');
        renderNotes();
        renderEditor();
    });

    $('#subjectList').addEventListener('click', (e) => {
        const li = e.target.closest('.subject-item');
        if (!li) return;
        state.currentSubjectId = li.dataset.id;
        state.currentNoteId = null;
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
        state.currentNoteId = li.dataset.id;
        state.editMode = false;
        $('#editToggleBtn').textContent = '编辑';
        $('#editorBody').classList.remove('mode-edit');
        $('#editorBody').classList.add('mode-preview');
        renderEditor();
    });

    let saveTimer = null;
    const scheduleSave = () => {
        clearTimeout(saveTimer);
        saveTimer = setTimeout(saveCurrentNote, 300);
    };
    $('#noteTitle').addEventListener('input', scheduleSave);
    $('#noteContent').addEventListener('input', () => {
        scheduleSave();
        updatePreview();
    });

    setupDragDrop();
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

async function deleteNote() {
    if (!state.currentNoteId) return;
    const n = state.notes.find((x) => x.id === state.currentNoteId);
    if (!n) return;
    if (!confirm(`确定删除「${n.title || '无标题'}」？`)) return;
    await idbDel('notes', n.id);
    state.notes = state.notes.filter((x) => x.id !== n.id);
    state.currentNoteId = null;
    renderNotes();
    renderEditor();
}

// ============ 更多菜单 ============
function handleAction(a) {
    switch (a) {
        case 'theme': return showTheme();
        case 'fontSize': return showFontSize();
        case 'defaultSubject': return showDefaultSubject();
        case 'template': return showTemplate();
        case 'renameSubject': return renameSubject();
        case 'export': return exportData();
        case 'import': return importData();
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
    const settingsArr = await idbAll('settings');
    const settings = {};
    for (const s of settingsArr) settings[s.key] = s.value;

    const safeName = (s) =>
        String(s || '').replace(/[\\/:*?"<>|]/g, '_').replace(/^\.+$/, '_').trim() || 'untitled';

    const enc = new TextEncoder();
    const zipFiles = {};
    const usedPaths = new Set();
    const meta = {
        app: 'noteforge',
        version: 2,
        exportedAt: now(),
        settings,
        subjects: state.subjects,
        assets: [],
        notes: [],
    };

    // 打包 assets
    const assets = await idbAll('assets');
    for (const a of assets) {
        const path = `assets/${a.id}.${a.ext}`;
        const bytes = new Uint8Array(await a.blob.arrayBuffer());
        zipFiles[path] = [bytes, { level: 0 }];
        meta.assets.push({ id: a.id, name: a.name, type: a.type, ext: a.ext, file: path });
    }

    // 打包笔记
    for (const n of state.notes) {
        const subj = state.subjects.find((s) => s.id === n.subjectId);
        const subjDir = safeName(subj ? subj.name : '_orphan');
        const baseName = safeName(n.title || 'untitled');
        let path = `notes/${subjDir}/${baseName}.md`;
        let i = 2;
        while (usedPaths.has(path)) path = `notes/${subjDir}/${baseName}-${i++}.md`;
        usedPaths.add(path);

        // 把 nf:asset/<id> 换成相对路径 ../../assets/<id>.<ext>
        let content = n.content || '';
        content = content.replace(/nf:asset\/([\w-]+)/g, (m, id) => {
            const a = meta.assets.find((x) => x.id === id);
            return a ? `../../${a.file}` : m;
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

    // 元数据
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
  noteforge.json        配置与元数据
  notes/<科目>/<标题>.md  纯 Markdown 笔记
  assets/<id>.<ext>     图片等附件
  README.txt            本文件

notes/ 下的 .md 是纯 Markdown，可用任何编辑器打开。
图片以相对路径 ../../assets/ 引用。

导入时请使用未解压的 zip 文件（可被 7-Zip / WinRAR 重打包，
但请勿修改内部目录结构）。
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

            const metaRaw = zipFiles['noteforge.json'];
            if (!metaRaw) throw new Error('缺少 noteforge.json，不是 NoteForge 导出文件');
            const meta = JSON.parse(dec.decode(metaRaw));
            if (meta.app !== 'noteforge' || !Array.isArray(meta.subjects) || !Array.isArray(meta.notes)) {
                throw new Error('noteforge.json 格式不正确');
            }

            // 1. 恢复 assets
            const assetsMeta = Array.isArray(meta.assets) ? meta.assets : [];
            const assetPathMap = new Map(); // assetId -> zip 路径
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

            // 2. 恢复笔记
            const notes = [];
            let missing = 0;
            for (const n of meta.notes) {
                const raw = zipFiles[n.file];
                if (!raw) { missing++; continue; }
                let content = dec.decode(raw);
                // 把 ../../assets/<id>.<ext> 换回 nf:asset/<id>
                content = content.replace(/\.\.\/\.\.\/assets\/([\w-]+)\.\w+/g, (m, id) =>
                    assetPathMap.has(id) ? `nf:asset/${id}` : m
                );
                notes.push({ ...n, content });
            }
            if (missing > 0) {
                const go = confirm(`有 ${missing} 篇笔记在 zip 中找不到对应文件，继续导入其余笔记？`);
                if (!go) return;
            }

            // 3. 走冲突处理
            await handleImport({
                subjects: meta.subjects,
                notes,
                settings: meta.settings || {},
            });
        } catch (err) {
            alert('导入失败：' + err.message);
        }
    };
    input.click();
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

// ============ 启动 ============
init().catch((err) => {
    console.error(err);
    alert('初始化失败：' + err.message);
});