<template>
    <div class="blog-editor" :class="[`layout-${layout}`, { 'is-mobile': isMobile }]" @dragover.prevent>
        <!-- ═══ Ribbon Toolbar ═══ -->
        <div class="editor-ribbon">
            <!-- Hamburger menu (far left) -->
            <div class="ribbon-more ribbon-more--left">
                <button class="ribbon-btn icon-label-btn" @click="showMoreMenu = !showMoreMenu" title="Menu">
                    <span class="icon-svg" v-html="Icons.menu"></span> <span class="label ribbon-btn-label"
                        style="font-size: 13px">{{ t('editor.menu') }}</span>
                </button>
                <div v-if="showMoreMenu" class="dropdown-backdrop" @click="showMoreMenu = false"></div>
                <Transition name="dropdown">
                <div v-if="showMoreMenu" class="more-dropdown">
                    <button @click="openFileMenu(); showMoreMenu = false">
                        <span class="icon-svg more-icon" v-html="Icons.file"></span> {{ t('editor.fileLabel') }}
                    </button>
                    <button v-if="profile.showProperties" @click="openMetaModal(); showMoreMenu = false">
                        <span class="icon-svg more-icon" v-html="Icons.edit"></span> {{ t('editor.meta') || 'Properties'
                        }}
                    </button>
                    <hr>
                    <button :class="{ active: editorTheme === 'dark' }"
                        @click="editorTheme = 'dark'; showMoreMenu = false">
                        <span class="icon-svg more-icon" v-html="Icons.themeDark"></span> {{t('theme.dark')}}
                    </button>
                    <button :class="{ active: editorTheme === 'light' }"
                        @click="editorTheme = 'light'; showMoreMenu = false">
                        <span class="icon-svg more-icon" v-html="Icons.themeLight"></span> {{t('theme.light')}}
                    </button>
                    <hr>
                    <div class="more-locale-row">
                        <span class="icon-svg more-icon" v-html="Icons.globe"></span>
                        <select v-model="editorLocale" class="locale-select" @change="showMoreMenu = false">
                            <option value="en">English</option>
                            <option value="zh-CN">简体中文</option>
                        </select>
                    </div>
                </div>
                </Transition>
            </div>
            <span class="ribbon-sep"></span>

            <!-- QAT: Quick Access Toolbar -->
            <div class="ribbon-qat">
                <button class="ribbon-btn qat-btn" @click="undo" :disabled="!canUndo" title="Undo (Ctrl+Z)">
                    <span class="icon-svg" v-html="Icons.undo"></span>
                </button>
                <button class="ribbon-btn qat-btn" @click="redo" :disabled="!canRedo" title="Redo (Ctrl+Y)">
                    <span class="icon-svg" v-html="Icons.redo"></span>
                </button>
                <span class="ribbon-sep"></span>
            </div>

            <!-- Tab bar (responsive, config-driven) -->
            <div class="ribbon-tabs" ref="tabsRef" :data-overflow="tabsOverflow">
                <template v-if="!tabsOverflow">
                    <button v-for="tab in ribbonTabs" :key="tab.id" class="ribbon-tab"
                        :class="{ active: activeTab === tab.id }" @click="activeTab = tab.id">
                        <span class="icon-svg tab-icon" v-html="tab.icon"></span> {{ t(tab.label) }} 
                    </button>
                </template>
                <template v-else>
                    <div class="ribbon-more">
                        <button class="ribbon-tab active" @click="tabMenuOpen = !tabMenuOpen">
                            <span class="icon-svg tab-icon" v-html="activeTabDef?.icon"></span> {{ t(activeTabDef?.label || 'editor.tab') }}
                            <span class="icon-svg ribbon-tab-chevron" v-html="Icons.chevron"></span>
                        </button>
                        <div v-if="tabMenuOpen" class="dropdown-backdrop" @click="tabMenuOpen = false"></div>
                        <Transition name="dropdown">
                        <div v-if="tabMenuOpen" class="more-dropdown">
                            <button v-for="tab in ribbonTabs" :key="tab.id" :class="{ active: activeTab === tab.id }"
                                @click="activeTab = tab.id; tabMenuOpen = false">
                                <span class="icon-svg more-icon" v-html="tab.icon"></span> {{ t(tab.label) }}
                            </button>
                        </div>
                        </Transition>
                    </div>
                </template>
            </div>

            <!-- Right controls -->
            <div class="ribbon-right">
                <!-- Title inline -->
                <div class="ribbon-title-area">
                    <input v-model="postTitle" class="ribbon-title-input" :placeholder="t('editor.untitled')"
                        spellcheck="false" :readonly="profile.titleReadonly" />
                    <span v-if="profile.showStatus" :class="['ribbon-status', postStatus, { clickable: isCloudEditing }]"
                        @click="toggleStatus" :title="isCloudEditing ? $t('editor.toggleStatus') : ''"
                    >{{ $t('status.' + (postStatus || 'published')) }}</span>
                    <span class="ribbon-save-status" :class="{ building: isBuilding, saving: isSaving, dirty: isDirty, new: isNewAndClean && !isDirty }"
                        @click="showStatusPopover = !showStatusPopover" @blur="showStatusPopover = false" tabindex="0">
                        <span class="icon-svg"
                            v-html="isBuilding ? Icons.sync : isSaving ? Icons.save : (isNewAndClean || isDirty) ? Icons.dot : Icons.check"></span>
                    </span>
                    <Transition name="dropdown">
                    <div v-if="showStatusPopover" class="status-popover" @click.self="showStatusPopover = false">
                        <div class="status-popover-row"><span class="status-popover-label">{{ t("editor.statusLabel") }}</span> <span>{{
                            statusLabel
                        }}</span></div>
                        <div v-if="postDate" class="status-popover-row"><span
                                class="status-popover-label">{{ t("editor.createdLabel") }}</span> <span>{{
                                    formatDateTime(postDate, locale, 'absolute', 'show-weekday', 'hide-seconds', '24h', t)
                                }}</span>
                        </div>
                        <div v-if="lastSavedTime" class="status-popover-row"><span class="status-popover-label">Last
                                saved</span>
                            <span>{{ formatDateTime(lastSavedTime, locale, 'relative', 'show-weekday', 'hide-seconds',
                                '24h', t)
                            }}</span>
                        </div>
                        <div v-if="postUpdated" class="status-popover-row"><span class="status-popover-label">Last
                                published</span>
                            <span>{{ formatDateTime(postUpdated, locale, 'relative', 'show-weekday', 'hide-seconds',
                                '24h', t)
                            }}</span>
                        </div>
                    </div>
                    </Transition>
                </div>
                <span class="ribbon-sep"></span>
                <button class="ribbon-btn" @click="openPrintPreview()" title="Print (Ctrl+P)">
                    <span class="icon-svg" v-html="Icons.print"></span>
                </button>

                <!-- Split save button: left=Save, right=dropdown -->
                <div class="ribbon-split-btn">
                    <button class="ribbon-btn ribbon-btn-pri icon-label-btn"
                        @click="handleSplitSave" :disabled="isSaving" :title="isCloudEditing ? t('editor.save') : t('editor.file.savedToFile')">
                        <span class="icon-svg" v-html="Icons.save"></span>
                        <span class="btn-label label">{{ isSaving ? t('editor.saving') : t('editor.save') }}</span>
                    </button>
                    <button class="ribbon-btn ribbon-btn-pri split-chevron"
                        @click="showSaveMenu = !showSaveMenu" :disabled="isSaving" title="More options">
                        <span class="icon-svg" v-html="Icons.chevron"></span>
                    </button>
                    <div v-if="showSaveMenu" class="dropdown-backdrop" @click="showSaveMenu = false"></div>
                    <Transition name="dropdown">
                    <div v-if="showSaveMenu" class="more-dropdown save-dropdown">
                        <button @click="saveAs(); showSaveMenu = false">
                            <span class="icon-svg more-icon" v-html="Icons.save"></span> {{ t('editor.saveAs') }}
                        </button>
                        <button v-if="!isCloudEditing" @click="openImportModal(); showSaveMenu = false">
                            <span class="icon-svg more-icon" v-html="Icons.publish"></span> {{ t('editor.addToWorkspace') || 'Add to Workspace' }}
                        </button>
                        <button @click="openFileMenu(); fileTab = 'export'; showSaveMenu = false">
                            <span class="icon-svg more-icon" v-html="Icons.export"></span> {{ t('editor.file.export') }}
                        </button>
                    </div>
                    </Transition>
                </div>
            </div>
        </div>

        <!-- ═══ Ribbon Content (tab-specific) ═══ -->
        <div class="ribbon-content">
            <template v-for="tab in ribbonTabs" :key="tab.id">
                <div v-show="activeTab === tab.id" class="ribbon-group-row">
                    <template v-for="(group, gi) in tab.groups" :key="gi">
                        <div class="ribbon-group">
                            <template v-for="tool in group.tools" :key="tool.id">
                                <span v-if="tool.type === 'spacer'" class="ribbon-spacer"></span>
                                <button v-else-if="tool.isStats" class="ribbon-btn ribbon-btn-wordcount"
                                    @click="(e) => openToolPopover(tool, e)">{{ wordCountLabel }}</button>
                                <button v-else class="ribbon-btn ribbon-btn-lg"
                                    :class="{ active: tool.action ? isToolActive(tool.action) : false }"
                                    @click="tool.popover ? openToolPopover(tool, $event) : tool.onClick ? tool.onClick($event) : handleToolAction(tool.action || '')" :title="tool.label">
                                    <span v-if="tool.icon" class="icon-svg" v-html="tool.icon"></span>
                                    <span class="ribbon-btn-label">{{ t('editor.tool.' + tool.id) || tool.label }}</span>
                                </button>
                            </template>
                        </div>
                        <span v-if="gi < tab.groups.length - 1" class="ribbon-sep ribbon-sep--large"></span>
                    </template>
                </div>
            </template>
        </div>

        <!-- Editor Body: dynamic by route type -->
        <div class="editor-body-wrapper">
          <EditorArticleBody v-if="editorType === 'article'" :key="'article-' + bodyKey" ref="editorBodyRef" v-model="localValue"
            :disabled="!dataReady" :font-class="fontClass"
            :placeholder="t('editor.placeholder')" :layout-mode="(layout as any)" />
          <EditorSlidesBody v-else :key="'slides-' + bodyKey" ref="editorBodyRef" v-model="localValue"
            :disabled="!dataReady" :font-class="fontClass"
            :placeholder="t('editor.placeholder')" :layout-mode="(layout as any)" />
        </div>

        <!-- Group 1: File Menu Modal -->
        <div v-if="activeModal === 'file'" class="modal-overlay">
            <div class="modal-content file-menu-modal">
                <div class="sidebar file-menu-sidebar">
                    <button v-for="tab in fileTabs" :key="tab.id" class="sidebar-btn"
                        :class="{ active: fileTab === tab.id }" @click="handleFileTabChange(tab.id)">
                        <span class="icon-svg sidebar-icon" v-html="tab.icon"></span>
                        {{ t(tab.label) }}
                    </button>

                    <button class="sidebar-btn sidebar-btn--print" type="button"
                        @click="openPrintPreview({ autoPrint: true })">
                        <span class="icon-svg sidebar-icon" v-html="Icons.print"></span>
                        {{ t('editor.print') }}
                    </button>
                </div>
                <div class="main-area">
                    <div class="header">
                        <h3>{{ currentFileTabTitle }}</h3>
                        <button class="close-btn" @click="activeModal = 'none'">
                            <span class="icon-svg" v-html="Icons.close"></span>
                        </button>
                    </div>

                    <div class="content-body">
                        <!-- New Article / Slides -->
                        <div v-if="fileTab === 'new'" class="tab-pane">
                            <p>{{ t('editor.file.createNew') }}</p>
                            <div class="new-doc-grid">
                                <div class="new-doc-col">
                                    <button class="primary-btn" @click="createNew('article')">{{ t('editor.createNewArticle') }}</button>
                                    <button class="primary-btn" @click="createNew('slides')">{{ t('editor.createNewSlides') }}</button>
                                </div>
                            </div>
                            <div class="warning-box" style="margin-top:8px;">
                                {{ t('editor.file.createOnlineHint') }}
                            </div>
                        </div>

                        <!-- Open Post (Local Open / Recent / Uploaded) -->
                        <div v-if="fileTab === 'open'" class="tab-pane">
                            <div class="open-local-section">
                                <p>{{ t('editor.file.openLocalIntro') }}</p>
                                <div style="display:flex;gap:8px;align-items:center;">
                                    <button class="primary-btn" @click="requestOpenLocalFile">{{
                                        t('editor.file.openLocal') }}</button>
                                </div>
                            </div>

                            <div class="recent-section" style="margin-top:16px;">
                                <h4>{{ t('editor.file.recent') }}</h4>
                                <div v-if="recentProjects.length === 0" class="empty-library">{{
                                    t('editor.file.noRecent') }}</div>
                                <div v-else class="post-list">
                                    <div v-for="(r, idx) in recentProjects" :key="r.ts + '-' + idx" class="post-item"
                                        @click="openRecentProject(r)">
                                        <span class="post-title">{{ r.title }}</span>
                                        <span class="post-status status-chip"
                                            :class="r.cloud ? 'published' : 'local'">{{
                                                r.cloud ? t('editor.file.cloud')
                                                    : t('editor.file.local') }}</span>
                                        <span class="post-date">{{ new Date(r.ts).toLocaleString() }}</span>
                                    </div>
                                </div>
                            </div>

                            <div class="uploaded-section" style="margin-top:16px;">
                                <h4>{{ t('editor.file.workspace') }}</h4>
                                <div v-if="fileLoading" class="loading">{{ t('post.loadingPosts') }}</div>
                                <div v-else class="post-list">
                                    <div v-for="post in filePosts" :key="post.id" class="post-item"
                                        @click="handlePostOpen(post.id)">
                                        <span class="post-title">{{ post.title }}</span>
                                        <span class="post-status status-chip" :class="post.status || 'draft'">{{
                                            $t('status.' + (post.status || 'draft')) }}</span>
                                        <span class="post-date">{{ formatDateUtil(post.date, locale) }}</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- Import -->
                        <div v-if="fileTab === 'import'" class="tab-pane">
                            <p>{{ t('editor.file.importInstruction') }}</p>
                            <FilePicker @select="onFilePickerSelect" selectionMode="single"
                                :allowUpload="true" />
                            <div style="margin-top:.75rem;">
                                <button class="primary-btn" :disabled="!selectedImportFile && !selectedImportUrl"
                                    @click="executeFileAction">{{ t('editor.file.import') }}</button>
                            </div>
                        </div>

                        <!-- Export -->
                        <div v-if="fileTab === 'export'" class="tab-pane">
                            <p>{{ t('editor.file.exportIntro') }}</p>
                            <div style="display:flex;gap:8px;flex-wrap:wrap;">
                                <button class="primary-btn" @click="saveAs">{{ t('editor.file.saveAsMarkdown')
                                }}</button>
                                <button class="secondary-btn" @click="exportAsHTML">{{ t('editor.file.exportAsHtml')
                                }}</button>
                                <button v-if="editorType === 'slides'" class="secondary-btn" @click="exportAsPPTX">{{ t('editor.file.exportAsPptx') || 'Export as PPTX'
                                }}</button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- Group 2: Insert Modals (Media, Link, Table) -->
        <div v-if="['media', 'link', 'table'].includes(activeModal)" class="modal-overlay">
            <div class="modal-content" :class="activeModal === 'media' ? 'large-modal' : 'small-modal'">
                <div class="modal-header">
                    <h3>{{ activeModal === 'media' ? t('editor.media') : (activeModal === 'link' ? t('editor.link') :
                        t('editor.table')) }}</h3>
                    <button class="close-btn" @click="activeModal = 'none'">
                        <span class="icon-svg" v-html="Icons.close"></span>
                    </button>
                </div>

                <!-- Media Body -->
                <div v-if="activeModal === 'media'" class="modal-body media-manager-layout">
                    <FilePicker selectionMode="multiple" :allowLocalPick="!isCloudEditing"
                        :allowUpload="true"
                        :source="isCloudEditing ? 'post' : 'assets'"
                        :postId="postSlug || postId || undefined"
                        :initialFiles="displayedFiles.map(f => ({ name: f.name, uploadedUrl: f.url, preview: f.thumb || f.url }))"
                        @select="handleMediaPicked" @cancel="activeModal = 'none'" />
                </div>

                <!-- Link Body -->
                <div v-if="activeModal === 'link'" class="modal-body">
                    <div class="form-group">
                        <label>{{ t('editor.linktext') }}</label>
                        <input v-model="linkText" class="modal-input" :placeholder="t('editor.texttoDisplay')"
                            autofocus />
                    </div>
                    <div class="form-group">
                        <label>URL</label>
                        <input v-model="linkUrl" class="modal-input" placeholder="https://" @keyup.enter="insertLink" />
                    </div>
                    <div class="modal-actions">
                        <button class="secondary-btn" @click="activeModal = 'none'">{{ t('editor.cancel') }}</button>
                        <button class="primary-btn" @click="insertLink">{{ t('editor.insert') }}</button>
                    </div>
                </div>

                <!-- Table Body -->
                <div v-if="activeModal === 'table'" class="modal-body">
                    <div class="table-grid-container">
                        <div class="table-grid" @mouseleave="tableGridHover(tblRows, tblCols)">
                            <div v-for="i in 64" :key="i"
                                :class="['grid-cell', { active: ((i - 1) % 8 < tblHoverC) && (Math.floor((i - 1) / 8) < tblHoverR) }]"
                                @mouseover="tableGridHover(Math.floor((i - 1) / 8) + 1, (i - 1) % 8 + 1)"
                                @click="tableGridClick(Math.floor((i - 1) / 8) + 1, (i - 1) % 8 + 1)"></div>
                        </div>
                        <div class="grid-info">{{ tblHoverR }} x {{ tblHoverC }} {{ t('editor.table') }}</div>
                    </div>
                    <div class="manual-inputs">
                        <div class="form-group">
                            <label>{{ t('editor.rows') }}</label>
                            <input type="number" v-model="tblRows" min="1" class="modal-input" />
                        </div>
                        <div class="form-group">
                            <label>{{ t('editor.cols') }}</label>
                            <input type="number" v-model="tblCols" min="1" class="modal-input" />
                        </div>
                    </div>
                    <div class="modal-actions">
                        <button class="secondary-btn" @click="activeModal = 'none'">{{ t('editor.cancel') }}</button>
                        <button class="primary-btn" @click="insertTable">{{ t('editor.insert') }}</button>
                    </div>
                </div>
            </div>

        </div>
    </div>

    <!-- Group 2.5: Meta Properties Modal -->
    <div v-if="activeModal === 'meta'" class="modal-overlay">
        <div class="modal-content small-modal">
            <div class="modal-header">
                <h3>{{ t('editor.metaTitle') || 'Properties' }}</h3>
                <button class="close-btn" @click="activeModal = 'none'">
                    <span class="icon-svg" v-html="Icons.close"></span>
                </button>
            </div>
            <div class="modal-body">
                <div class="form-group">
                    <label>{{ t('editor.postTitle') }}</label>
                    <input v-model="postTitle" class="modal-input" :placeholder="t('editor.titlePlaceholder')" />
                </div>
                <div class="form-group">
                    <label>Slug</label>
                    <input v-model="postSlug" class="modal-input" :class="{ 'input-error': slugError }" @focus="slugError = false" :placeholder="!postId ? slugify(postTitle || tempTitle || 'untitled') : ''" :disabled="!!postId" />
                </div>
                <div class="form-group">
                    <label>{{ t('editor.tagsLabel') }}</label>
                    <div class="tags-input-container">
                        <div class="tag-controls">
                            <input v-model="tagInput" class="modal-input small-input"
                                :placeholder="t('editor.addTagPlaceholder')" @keyup.enter="addTag" />
                            <button class="secondary-btn small-btn" @click="addTag">{{ t('editor.addTag') }}</button>
                            <button class="secondary-btn small-btn" :class="{ active: postTags.includes('featured') }"
                                @click="toggleFeatured" :title="$t('tag.featured')">
                                {{ $t('tag.featured') }}
                            </button>
                        </div>
                        <div class="tags-list">
                            <span class="tag-badge" v-for="tag in sortTags(postTags)" :key="tag"
                                :class="{ featured: tag === 'featured' }">
                                {{ tag === 'featured' ? $t('tag.featured') : tag }}
                                <button class="tag-remove" @click="removeTag(tag)">
                                    <span class="icon-svg" v-html="Icons.close"></span>
                                </button>
                            </span>
                        </div>
                    </div>
                </div>
                <div class="form-group">
                    <label>{{ t('editor.authorLabel') }}</label>
                    <div class="tags-input-container">
                        <div class="tag-controls">
                            <input v-model="authorInput" class="modal-input small-input"
                                :placeholder="t('editor.authorPlaceholder')" @keyup.enter="addAuthor" />
                            <button class="secondary-btn small-btn" @click="addAuthor">{{ t('editor.addAuthor') }}</button>
                            <button class="secondary-btn small-btn" :class="{ active: postAuthors.includes(SITE_AUTHOR_PLACEHOLDER) }"
                                @click="toggleSiteAuthor" :title="t('editor.siteAuthorTip')">
                                {{ t('editor.siteAuthor') }}
                            </button>
                        </div>
                        <div class="tags-list" v-if="postAuthors.length">
                            <span class="tag-badge" v-for="(a, i) in postAuthors" :key="i"
                                :class="{ featured: a === SITE_AUTHOR_PLACEHOLDER }">
                                {{ a === SITE_AUTHOR_PLACEHOLDER ? t('editor.siteAuthor') : a }}
                                <button class="tag-remove" @click="removeAuthor(i)">
                                    <span class="icon-svg" v-html="Icons.close"></span>
                                </button>
                            </span>
                        </div>
                    </div>
                </div>
                <CheckRow v-model="postAIGenerated" :title="$t('editor.aiGeneratedLabel')" />
                <div class="modal-actions">
                    <button class="primary-btn" @click="activeModal = 'none'">{{ t('editor.done') || 'Done' }}</button>
                </div>
            </div>
        </div>
    </div>

    <!-- About page: simple save confirmation -->
    <div v-if="activeModal === 'aboutSave'" class="modal-overlay">
        <div class="modal-content small-modal">
            <div class="modal-header">
                <h3>{{ t('editor.save') }}</h3>
                <button class="close-btn" @click="activeModal = 'none'">
                    <span class="icon-svg" v-html="Icons.close"></span>
                </button>
            </div>
            <div class="modal-body">
                <p class="about-save-confirm">{{ t('editor.confirmAboutSave') || 'Save about page content?' }}</p>
                <div class="modal-actions">
                    <button class="secondary-btn" @click="activeModal = 'none'">{{ t('editor.cancel') }}</button>
                    <button class="primary-btn" @click="doSave(); activeModal = 'none'"
                        :disabled="isSaving">
                        {{ isSaving ? t('editor.saving') : t('editor.save') }}
                    </button>
                </div>
            </div>
        </div>
    </div>

    <!-- Import to workspace modal (local → repo) -->
    <div v-if="activeModal === 'import'" class="modal-overlay">
        <div class="modal-content small-modal">
            <div class="modal-header">
                <h3>{{ t('editor.addToWorkspace') || 'Add to Workspace' }}</h3>
                <button class="close-btn" @click="activeModal = 'none'">
                    <span class="icon-svg" v-html="Icons.close"></span>
                </button>
            </div>
            <div class="modal-body">
                <div class="form-group">
                    <label>{{ t('editor.postTitle') }}</label>
                    <input v-model="tempTitle" class="modal-input" :placeholder="t('editor.titlePlaceholder')"
                        @keyup.enter="doImport()" autofocus />
                </div>
                <div class="form-group">
                    <label>Slug</label>
                    <input v-model="postSlug" class="modal-input" :class="{ 'input-error': slugError }"
                        @focus="slugError = false"
                        :placeholder="slugify(tempTitle || postTitle || 'untitled')" />
                </div>
                <div class="form-group">
                    <label>{{ t('editor.tagsLabel') }}</label>
                    <div class="tags-input-container">
                        <div class="tag-controls">
                            <input v-model="tagInput" class="modal-input small-input"
                                :placeholder="t('editor.addTagPlaceholder')" @keyup.enter="addTag" />
                            <button class="secondary-btn small-btn" @click="addTag">{{ t('editor.addTag') }}</button>
                            <button class="secondary-btn small-btn"
                                :class="{ active: postTags.includes('featured') }" @click="toggleFeatured"
                                :title="$t('tag.featured')">
                                {{ $t('tag.featured') }}
                            </button>
                        </div>
                        <div class="tags-list">
                            <span class="tag-badge" v-for="tag in sortTags(postTags)" :key="tag"
                                :class="{ featured: tag === 'featured' }">
                                {{ tag === 'featured' ? $t('tag.featured') : tag }}
                                <button class="tag-remove" @click="removeTag(tag)">
                                    <span class="icon-svg" v-html="Icons.close"></span>
                                </button>
                            </span>
                        </div>
                    </div>
                </div>
                <div class="form-group">
                    <label>{{ t('editor.authorLabel') }}</label>
                    <div class="tags-input-container">
                        <div class="tag-controls">
                            <input v-model="authorInput" class="modal-input small-input"
                                :placeholder="t('editor.authorPlaceholder')" @keyup.enter="addAuthor" />
                            <button class="secondary-btn small-btn" @click="addAuthor">{{ t('editor.addAuthor') }}</button>
                            <button class="secondary-btn small-btn" :class="{ active: postAuthors.includes(SITE_AUTHOR_PLACEHOLDER) }"
                                @click="toggleSiteAuthor" :title="t('editor.siteAuthorTip')">
                                {{ t('editor.siteAuthor') }}
                            </button>
                        </div>
                        <div class="tags-list" v-if="postAuthors.length">
                            <span class="tag-badge" v-for="(a, i) in postAuthors" :key="i"
                                :class="{ featured: a === SITE_AUTHOR_PLACEHOLDER }">
                                {{ a === SITE_AUTHOR_PLACEHOLDER ? t('editor.siteAuthor') : a }}
                                <button class="tag-remove" @click="removeAuthor(i)">
                                    <span class="icon-svg" v-html="Icons.close"></span>
                                </button>
                            </span>
                        </div>
                    </div>
                </div>
                <div class="form-group">
                    <CheckRow v-model="postAIGenerated" :title="$t('editor.aiGeneratedLabel')" />
                </div>
                <div class="modal-actions">
                    <button class="secondary-btn" @click="activeModal = 'none'">{{ t('editor.cancel') }}</button>
                    <button class="primary-btn" @click="doImport()"
                        :disabled="isSaving || !tempTitle.trim()">
                        {{ isSaving ? t('editor.saving') : (t('editor.add') || 'Add') }}
                    </button>
                </div>
            </div>
        </div>
    </div>

    <!-- Text file insert choice modal -->
    <div v-if="textFileChoice" class="modal-overlay">
        <div class="modal-content small-modal">
            <div class="modal-header">
                <h3>{{ textFileChoice.name }}</h3>
            </div>
            <div class="modal-body">
                <p style="margin-top:6px;">{{ t('editor.textFileChoiceHint') || 'How would you like to insert this file?' }}</p>
                <div class="modal-actions" style="flex-wrap:wrap;">
                    <button class="secondary-btn"
                        @click="doInsertTextFile(textFileChoice!); textFileChoice = null; flushPendingFiles()">
                        {{ t('editor.insertAsText') || 'Insert as text' }}
                    </button>
                    <button class="secondary-btn"
                        @click="doInsertCodeBlock(textFileChoice!); textFileChoice = null; flushPendingFiles()">
                        {{ t('editor.insertAsCode') || 'Insert as code' }}
                    </button>
                    <button class="primary-btn"
                        @click="doInsertFileCard(textFileChoice!); textFileChoice = null; flushPendingFiles()">
                        {{ t('editor.insertAsFile') || 'Insert as a file' }}
                    </button>
                </div>
            </div>
        </div>
    </div>

    <!-- Group 4: Confirmation Modals (Restore, Unsaved) -->
    <div v-if="['restore', 'unsaved', 'syncConflict'].includes(activeModal)" class="modal-overlay">
        <div class="modal-content small-modal">
            <div class="modal-header">
                <h3 v-if="activeModal === 'restore'">{{ t('editor.confirmRestoreTitle') }}</h3>
                <h3 v-else-if="activeModal === 'unsaved'">{{ t('editor.unsavedTitle') }}</h3>
                <h3 v-else-if="activeModal === 'syncConflict'">{{ t('editor.versionConflictTitle') }}</h3>

                <button v-if="activeModal !== 'syncConflict'" class="close-btn" @click="activeModal = 'none'">
                    <span class="icon-svg" v-html="Icons.close"></span>
                </button>
            </div>

            <!-- Restore Body -->
            <div v-if="activeModal === 'restore'" class="modal-body">
                <p class="confirm-text">
                    {{ t('editor.confirmRestoreBody') }}
                </p>
                <div class="modal-actions">
                    <button class="secondary-btn" @click="activeModal = 'none'">{{ t('editor.cancel') }}</button>
                    <button class="primary-btn danger-action" @click="doRestore">{{ t('editor.confirmRestoreAction')
                        }}</button>
                </div>
            </div>

            <!-- Unsaved Body -->
            <div v-if="activeModal === 'unsaved'" class="modal-body">
                <p class="confirm-text">
                    {{ t('editor.unsavedBody', { title: postTitle || t('editor.untitled') }) }}
                </p>
                <div class="modal-actions">
                    <button class="secondary-btn" @click="closeModals">{{ t('editor.cancel') }}</button>
                    <button class="secondary-btn danger-outline" @click="handleUnsavedOption('discard')">{{
                        t('editor.discard') }}</button>
                    <button class="primary-btn" @click="handleUnsavedOption('save')">{{ t('editor.saveContinue')
                        }}</button>
                </div>
            </div>

            <div v-if="activeModal === 'syncConflict'" class="modal-body">
                <p class="confirm-text">
                    {{ t('editor.versionConflictBody', { title: pendingConflictDetail?.title || t('editor.untitled') })
                    }}
                </p>
                <div class="modal-actions">
                    <button class="secondary-btn" @click="resolveVersionConflict('local')">{{
                        t('editor.useLocalDraft') }}</button>
                    <button class="primary-btn" @click="resolveVersionConflict('cloud')">{{
                        t('editor.useCloudVersion') }}</button>
                </div>
            </div>

        </div>
    </div>

    <!-- Math Formula Modal -->
    <div v-if="activeModal === 'math'" class="modal-overlay">
        <div class="modal-content small-modal">
            <div class="header">
                <h3>{{ t('editor.mathTitle') }}</h3>
                <button class="close-btn" @click="activeModal = 'none'"><span class="icon-svg"
                        v-html="Icons.close"></span></button>
            </div>
            <div class="modal-body math-modal-body">
                <textarea v-model="mathInput" class="modern-textarea modal-math-textarea" rows="4"
                    placeholder="E = mc^2"></textarea>
                <div class="math-options">
                    <label><input type="radio" v-model="mathMode" value="inline" /> {{ t("editor.mathInline") }}</label>
                    <label><input type="radio" v-model="mathMode" value="block" /> {{ t("editor.mathBlock") }}</label>
                </div>
                <div class="math-preview" >
                    <span class="math-preview-render" ref="mathPreviewRef"></span>
                </div>
                <div class="modal-actions">
                    <button class="secondary-btn" @click="activeModal = 'none'">{{ t('editor.cancel') }}</button>
                    <button class="primary-btn" @click="insertMath">{{ t('editor.insert') }}</button>
                </div>
            </div>
        </div>
    </div>



<!-- Upload Toast -->
    <div v-if="uploadState.show" class="upload-toast" :class="uploadState.status">
        <div class="toast-content">
            <div class="toast-header-row">
                <span class="toast-title">{{ t('editor.fileUpload') }}</span>
                <button class="toast-close" @click="uploadState.show = false">
                    <span class="icon-svg" v-html="Icons.close"></span>
                </button>
            </div>
            <div class="toast-message">{{ uploadState.message }}</div>
            <div v-if="['uploading', 'processing'].includes(uploadState.status)" class="toast-progress-bg">
                <div class="toast-progress-bar" :style="{ width: uploadState.progress + '%' }"></div>
            </div>
        </div>

    </div>
    <FilePreviewModal />
    <!-- 单例 ToolDropdown：容器声明式，内容 preset 驱动 -->
    <ToolDropdown ref="ddRef" :items="ddPreset.type === 'menu' ? ddPreset.items : []"
      @select="(a: string) => ddOnSelect?.(a)">
      <template v-if="ddPreset.type === 'kv'">
        <div class="tool-dropdown-stat" v-for="r in ddPreset.rows" :key="r.label">
          <span>{{ r.label }}</span>
          <span class="stat-num">{{ r.value }}</span>
        </div>
      </template>
      <template v-else-if="ddPreset.type === 'custom'">
        <component :is="ddPreset.content" />
      </template>
    </ToolDropdown>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick, reactive, provide, type Ref } from 'vue'
import { useRoute, useRouter, onBeforeRouteLeave, onBeforeRouteUpdate } from 'vue-router'
import { useI18n } from 'vue-i18n'

// Slug validation — format + min length. Conflicts get -2/-3 suffix server-side.
const slugError = ref(false)
const slugRe = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
function validateSlug(): boolean {
  if (!!postId.value) return true
  const val = postSlug.value.trim()
  if (!val) return true
  const chars = val.replace(/-/g, '')
  if (!slugRe.test(val) || chars.length < 3) { slugError.value = true; return false }
  slugError.value = false; return true
}
import { settingsStore } from '../composables/settingsApi.ts'
import { Icons } from '../utils/icons.ts'

/** Hollow ring icon for new/unsaved state — 2.5px stroke, 12px outer diameter */

import { convertToHtml } from '../utils/markdownParser.ts'
import { renderPreview, setPreviewPostId } from '../utils/markdownPreview.ts'
import { sortTags } from '../utils/tagUtils.ts'
import { formatDate as formatDateUtil, formatDateTime } from '../utils/dateUtils.ts'
import { debounce } from '../utils/debounce.ts'
import { getNotificationCenter } from '../composables/useNotificationCenter.ts'
import useToast from '../composables/useToast.ts'
import { triggerBuild } from '../composables/useAstroBuild.ts'

import CheckRow from './ui/CheckRow.vue'
import FilePicker from './FilePicker.vue'
import EditorArticleBody from './EditorArticleBody.vue'
import EditorSlidesBody from './EditorSlidesBody.vue'
import FilePreviewModal from './FilePreviewModal.vue'
import ToolDropdown from './slides/ToolDropdown.vue'

import { useModal } from '../composables/editor/core/useModalStack'
import { useEditorFrontmatter } from '../composables/editor/markdown/useFrontmatter'
import { useEditorView } from '../composables/editor/core/useEditorLayout'
import { useEditorProfile } from '../composables/editor/core/useEditorProfile'
import { provideToolDropdown, type DropdownPreset } from '../composables/editor/core/useToolDropdown'
import { useEditorMedia } from '../composables/editor/article/useEditorMedia'
import { useEditorToolbar, type RibbonTool } from '../composables/editor/core/useEditorToolbar'
import { useEditorFile } from '../composables/editor/markdown/useEditorFile'
import { useEditorSession } from '../composables/editor/core/useEditorLifecycle'
import { resolveEditorRoute } from '../composables/editor/cloud/useCloudRouter'
import { slugify, SITE_AUTHOR_PLACEHOLDER } from '@chronicle/shared/src/utils'
import { useFileMenu } from '../composables/editor/markdown/useMarkdownFileMenu'

import type { IEditorBody } from './editor/IEditorBody.ts'
import type { ISlidesBody } from './editor/ISlidesBody.ts'

// ═══ Route / i18n / env ═══
const route = useRoute()
const router = useRouter()
const { t, locale } = useI18n()
const { show: showToast } = useToast()
const editorBasePath = '/editor'
const nc = getNotificationCenter()
const isElectron = !!(typeof window !== 'undefined' && (window as any).chronicleElectron?.isElectron)

// ═══ Props / Emit ═══
const props = withDefaults(defineProps<{ modelValue?: string }>(), { modelValue: '' })
const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
  (e: 'ready'): void
}>()

// ═══ Core state ═══
const editorType = ref<'article' | 'slides'>(
  route.path.startsWith('/editor/slides') ? 'slides' : 'article'
)
watch(() => route.path, (p) => {
  const t = p.startsWith('/editor/slides') ? 'slides' : 'article'
  if (editorType.value !== t) editorType.value = t
})
const editorQueryId = computed<string | undefined>(() => {
  const id = route.query.id
  if (Array.isArray(id)) return String(id[0])
  if (id) return String(id)
  return undefined
})
const isCloudEditing = computed(() => !!editorQueryId.value)
const isAboutMode = computed(() => editorQueryId.value === '__about__')

// ── Editor profile — 按页面类型封装 UI 差异 ──
const { profile, isAbout } = useEditorProfile({ editorQueryId, isCloudEditing })
const activeModal = ref('none')
const showSaveMenu = ref(false)

// ── 单例 ToolDropdown ──
const ddRef = ref<InstanceType<typeof ToolDropdown> | null>(null)
const ddPreset = ref<DropdownPreset>({ type: 'menu', items: [] })
const ddOnSelect = ref<((action: string) => void) | null>(null)

provideToolDropdown({
  preset: ddPreset,
  onSelect: ddOnSelect,
  open(x, y?) { ddRef.value?.open(x, y) },
  close() { ddRef.value?.close() },
})

function openToolPopover(tool: RibbonTool, e: MouseEvent) {
  let preset: DropdownPreset
  if (tool.isStats) {
    const s = editorStats.value
    preset = { type: 'kv', rows: [
      { label: t('editor.stats.words'), value: s.wordCount },
      { label: t('editor.stats.charsNoSpaces'), value: s.charCountNoSpaces },
      { label: t('editor.stats.charsWithSpaces'), value: s.charCount },
      { label: t('editor.stats.nonWestern'), value: s.nonWesternCount },
      { label: t('editor.stats.markdownChars'), value: s.markdownCount },
    ] }
  } else if (tool.popover) {
    preset = typeof tool.popover === 'function' ? tool.popover() : tool.popover
  } else {
    return
  }
  ddPreset.value = preset
  if (preset.type === 'menu') {
    const handler = tool.popoverOnSelect || ((a: string) => { handleToolAction(a); ddRef.value?.close() })
    ddOnSelect.value = (a) => { handler(a); ddRef.value?.close() }
  }
  ddRef.value?.open(e.clientX)
}

const localValue = ref(props.modelValue)
const assetMap = ref<Record<string, string>>({})

// Skeleton
const dataReady = ref(false)
const bodyKey = ref(0)
const skeletonStatus = ref('editor.skeletonLoading')
const skeletonShowDirectEntry = ref(false)
const skeletonTimer: { current: ReturnType<typeof setTimeout> | null } = { current: null }
provide('skeletonStatus', skeletonStatus)
provide('skeletonShowDirectEntry', skeletonShowDirectEntry)

// ══════════════════════════════════════════════════════
// Layer 1: useEditorFrontmatter (flat destructure)
// ══════════════════════════════════════════════════════
const {
  postTitle, isDefaultTitle, postDate, postUpdated,
  postTags, postSlug, postFont, postAuthor, postAIGenerated, slideshowConfig,
  tagInput, postId, postStatus,
  savedContent, savedFm, fmChanged,
  buildSavedFm, addTag, removeTag, toggleFeatured,
  readAuthorFromDetail, readAiGeneratedFromDetail, normalizeBody,
  parseFrontmatter, stringifyFrontmatter: serializeFrontmatter,
  localFileToApiFormat, extractEditorFm,
  isSlidesMeta, buildLocalDetail, CHRONICLE_FM_KEYS,
} = useEditorFrontmatter({ editorType, t })

// ── 作者输入：多值 tag 风格 + 「本人」一键（$site$ 占位符）──
const authorInput = ref('')
const postAuthors = ref<string[]>([])
// postAuthor（逗号分隔串，useFrontmatter 管理）↔ postAuthors（数组）双向同步：
// 读——frontmatter 'Alice, Bob' → ['Alice','Bob']；写——数组变化回写逗号串，保存链路不变
watch(postAuthor, (v) => {
  const arr = v ? v.split(',').map(s => s.trim()).filter(Boolean) : []
  if (arr.join('\u0000') !== postAuthors.value.join('\u0000')) postAuthors.value = arr
})
watch(postAuthors, (arr) => {
  const joined = arr.join(', ')
  if (postAuthor.value !== joined) postAuthor.value = joined
})
function addAuthor(): void {
  const v = authorInput.value.trim()
  if (v && !postAuthors.value.includes(v)) postAuthors.value = [...postAuthors.value, v]
  authorInput.value = ''
}
function removeAuthor(i: number): void {
  const next = [...postAuthors.value]; next.splice(i, 1); postAuthors.value = next
}
function toggleSiteAuthor(): void {
  const has = postAuthors.value.includes(SITE_AUTHOR_PLACEHOLDER)
  postAuthors.value = has
    ? postAuthors.value.filter(a => a !== SITE_AUTHOR_PLACEHOLDER)
    : [...postAuthors.value, SITE_AUTHOR_PLACEHOLDER]
}

// ═══ Dirty state (before view — view needs isDirty etc) ═══
const isSaving = ref(false)
const isBuilding = ref(false)
const bodyChanged = computed(() => {
  if (editorType.value === 'slides') return localValue.value !== savedContent.value
  return normalizeBody(localValue.value) !== savedContent.value
})
const isDirty = computed(() => fmChanged.value || bodyChanged.value)
const isNewAndClean = computed(() =>
  !isDirty.value && !isSaving.value && !isBuilding.value &&
  (postStatus.value === 'local' || postStatus.value === 'draft') &&
  !currentFileHandle.value && !currentFilePath.value && !postId.value
)

// ══════════════════════════════════════════════════════
// Layer 1: useEditorView (flat destructure)
// ══════════════════════════════════════════════════════
const {
  layout, isMobile, isZenMode,
  showMoreMenu, tabMenuOpen, tabsOverflow, hideTitle, tabsRef, showStatusPopover,
  editorTheme, editorLocale, fontOptions, fontClass,
  showEditor, showPreview, statusLabel,
} = useEditorView({ editorType, postFont, isDirty, isSaving, isBuilding, isNewAndClean, locale, t, route })

// ═══ Editor body ref ═══
const editorBodyRef = ref<IEditorBody | ISlidesBody | null>(null)
const canUndo = computed(() => !!(editorBodyRef.value as any)?.canUndo)
const canRedo = computed(() => !!(editorBodyRef.value as any)?.canRedo)

// ══════════════════════════════════════════════════════
// Layer 2: useEditorMedia (flat destructure)
// ══════════════════════════════════════════════════════
const {
  uploadedImages, fileInputRef, uploadState,
  selectedCategory, mediaCategories, displayedFiles,
  fileMap, textFileChoice, pendingFiles,
  openMediaModal, fetchServerImages, handleMediaPicked,
  handleFileSelect, triggerFileUpload, uploadMediaFile,
  fileToUrl, fileToMarkdownUrl, getTypePrefixForFile,
  insertMediaMarkdown, insertImageMarkdown, encodeMarkdownUrl,
  handleLocalFiles, onEditorPaste, onEditorDrop, onEditorDropCapture,
  doInsertTextFile, doInsertCodeBlock, doInsertFileCard, flushPendingFiles,
  resolveLocalFileUrls, applyUrlMappings,
  extractLocalUrls, getFileFromUrl,
} = useEditorMedia({
  editorBodyRef: editorBodyRef as Ref<any>,
  activeModal, isCloudEditing,
  showToast, t,
  isElectron,
  postSlug, postId,
})

// ═══ Mermaid helpers ═══
async function prerenderMermaidInCompiledHtml(html: string) {
  if (!html || !/data-language="mermaid"/.test(html)) return html
  let mod: any
  try { mod = await import('mermaid') } catch (e) { console.warn('Failed to load mermaid for compiledHtml prerender', e); return html }
  const mermaid = (mod && mod.default) || mod
  try { mermaid.initialize({ startOnLoad: false, theme: 'base', themeVariables: { fontFamily: 'var(--app-font-stack)' } }) } catch {}
  const host = document.createElement('div')
  host.innerHTML = html
  const blocks = host.querySelectorAll('.content-block[data-language="mermaid"] .code-chunk-container, .code-chunk-container[data-language="mermaid"]')
  let idx = 0
  for (const block of Array.from(blocks)) {
    try {
      const textarea = block.querySelector('.code-textarea') as HTMLTextAreaElement | null
      const codeText = textarea ? (textarea.value || textarea.textContent || '').trim() : ''
      if (!codeText) continue
      const id = 'mermaid_compiled_' + Date.now() + '_' + (idx++)
      const res = await mermaid.render(id, codeText)
      let svg = (res && (res.svg || res)) ? String(res.svg || res) : ''
      svg = svg.replace(/marker-(end|start)=("|')?url\([^#)]*#([^\)"']+)\)("|')?/g, (_m: string, pos: string) => `marker-${pos}="url(#chronicle-mermaid-arrow)"`)
      svg = svg.replace(/url\((?:"|')?[^#\)"']*#([^\)"']+)(?:"|')?\)/g, 'url(#chronicle-mermaid-arrow)')
      if (!svg) continue
      let holder = block.querySelector('.mermaid-prerendered') as HTMLDivElement | null
      if (!holder) { holder = document.createElement('div'); holder.className = 'mermaid-prerendered'; holder.style.display = 'none'; block.appendChild(holder) }
      holder.innerHTML = `<div class="mermaid-svg">${svg}</div>`
    } catch (e) { console.warn('mermaid render failed for compiledHtml block', e) }
  }
  return host.innerHTML
}

function escapeHtml(text: string) {
  return String(text || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

// ═══ Recent projects state ═══
const recentProjects = ref<Array<{ title: string; path?: string; cloud?: boolean; ts: number }>>([])
function pushRecentProject(meta: { title: string; path?: string; cloud?: boolean }) {
  const entry = { title: meta.title || t('editor.untitled'), path: meta.path, cloud: !!meta.cloud, ts: Date.now() }
  const existing = recentProjects.value.findIndex(r => r.path && meta.path && r.path === meta.path)
  if (existing >= 0) recentProjects.value.splice(existing, 1)
  recentProjects.value.unshift(entry)
  recentProjects.value = recentProjects.value.slice(0, 10)
  try { localStorage.setItem('chronicle_recent_projects', JSON.stringify(recentProjects.value)) } catch {}
}

// ══════════════════════════════════════════════════════
// Layer 2: useEditorToolbar
// ══════════════════════════════════════════════════════

const {
  ribbonTabs, activeTab, activeTabDef,
  loadToolbarConfig, isToolActive, handleToolAction,
  undo, redo,
  insertAtCursor, insertLink, insertTable, insertMath,
  insertFootnote, buildTocFromMarkdown,
  mathInput, mathMode, mathPreviewRef,
  linkText, linkUrl,
  tblRows, tblCols, tblHoverR, tblHoverC,
  tableGridHover, tableGridClick,
  editorStats, wordCountLabel,
} = useEditorToolbar({
  editorBodyRef: editorBodyRef as Ref<any>,
  editorType, postFont,
  localValue, isCloudEditing,
  layout,
  activeModal,
  openMediaModal: () => openMediaModal(),
  openExportModal: () => { openFileMenu(); fileTab.value = 'export' },
  t,
})

// ══════════════════════════════════════════════════════
// Layer 3: useEditorFile (flat destructure)
// ══════════════════════════════════════════════════════
const currentFileHandle = ref<any>(null)
const currentFilePath = ref<string | null>(null)

const {
  isSaving: _isSavingFO, isBuilding: _isBuildingFO, lastSavedTime,
  saveFile, saveAs, doSave, saveLocalDirect,
  buildFileContent, exportAsHTML, exportAsPPTX,
  triggerAstroBuild,
  buildPrintSnapshot, buildStandalonePrintHtml, openPrintPreview,
  handleTopRightSave, closeModals,
  tempTitle,
} = useEditorFile({
  editorType, editorBasePath, localValue,
  postTitle, isDefaultTitle, postId, postStatus: postStatus as any,
  postDate, postUpdated, postTags, postSlug, postFont, postAuthor, postAIGenerated,
  slideshowConfig,
  isCloudEditing, isAboutMode,
  buildSavedFm, normalizeBody,
  activeModal, showToast, t,
  currentFileHandle, currentFilePath,
  savedContent, savedFm,
  route, router, locale, assetMap,
  escapeHtml,
  fileMap,
  pushRecentProject,
  CHRONICLE_FM_KEYS,
  stringifyFrontmatter: serializeFrontmatter,
  preSave: async (content: string) => {
    const map = await resolveLocalFileUrls(content)
    return Object.keys(map).length ? applyUrlMappings(content, map) : content
  },
})

// Sync isSaving/isBuilding from fileOps into local refs used by template
watch(_isSavingFO, (v) => { isSaving.value = v })
watch(_isBuildingFO, (v) => { isBuilding.value = v })

// ══════════════════════════════════════════════════════
// Layer 4: useEditorSession (init/lifecycle)
// ══════════════════════════════════════════════════════
const {
  pendingConflictDetail, pendingConflictDraft, pendingConflictSessionHistory,
  initLoad, createPost, openPost,
  loadPost, canonicalPath,
  resetEditor,
  resolveVersionConflict, clearVersionConflictState,
} = useEditorSession({
  editorType, editorQueryId, editorBasePath, route, router, t, showToast,
  postId, postTitle, isDefaultTitle,
  postStatus: postStatus as any, postDate, postUpdated,
  postTags, postSlug, postFont, postAuthor, postAIGenerated, slideshowConfig,
  localValue, savedContent, savedFm,
  buildSavedFm, readAuthorFromDetail, readAiGeneratedFromDetail,
  currentFileHandle, currentFilePath,
  activeModal, editorBodyRef: editorBodyRef as Ref<any>,
  dataReady, bodyKey, skeletonStatus, skeletonShowDirectEntry, skeletonTimer,
  CHRONICLE_FM_KEYS,
  createResolveQuery: ({ createPost, openPost }) =>
    (queryId) => resolveEditorRoute({
      queryId,
      editorType,
      editorBasePath,
      router,
      skeletonStatus,
      showToast,
      t,
      actions: { createPost, openPost },
    }),
})

// ═══ Handle unsaved check ═══
let pendingActionCallback: (() => void) | null = null
const pendingRoute = ref<any>(null)
function handleUnsavedCheck(callback: () => void) {
  pendingActionCallback = callback
  activeModal.value = 'unsaved'
}

// ═══ updateEditor & clearCurrentLocalDocument 已移除 ═══
// createPost / openPost 直接完成所有初始化，不再需要中间人

// ══════════════════════════════════════════════════════
// Layer 4: useFileMenu (flat destructure)
// ══════════════════════════════════════════════════════
const {
  fileTab, filePosts, fileLoading,
  selectedImportFile, selectedImportUrl,
  fileTabs, currentFileTabTitle,
  openFileMenu, handleFileTabChange,
  onFilePickerSelect, executeFileAction,
  createNew,
  openLocalFilePicker, openRecentProject, requestOpenLocalFile,
  resetCurrentFile, handlePostOpen,
} = useFileMenu({
  editorType, editorBasePath, activeModal, isCloudEditing,
  isDirty, t,
  router, route,
  postId, postTitle, isDefaultTitle,
  postStatus, postDate, postUpdated,
  postTags, postSlug, postFont, postAuthor, postAIGenerated,
  localValue, savedContent, savedFm, buildSavedFm,
  currentFileHandle, currentFilePath,
  createPost, openPost, resetEditor,
  resolveVersionConflict, clearVersionConflictState,
  handleUnsavedCheck,
  pushRecentProject,
})

// ═══ Restore ═══
async function restorePost() {
  if (!isCloudEditing.value || !postId.value) return
  activeModal.value = 'restore'
}
async function doRestore() {
  if (!postId.value) return
  try {
    // Aurora: restore = clear draft and reload from local file
    localStorage.removeItem(`chronicle_draft_${postId.value}`)
    sessionStorage.removeItem(`chronicle_history_${postId.value}`)
    await initLoad()
    activeModal.value = 'none'
  } catch (e) { alert('Error restoring') }
}

function openMetaModal() { activeModal.value = 'meta' }

// ═══ Status toggle ──────────────────────────────────
function toggleStatus() {
  if (!isCloudEditing.value) return
  postStatus.value = postStatus.value === 'published' ? 'draft' : 'published'
}

// ═══ Split save button ═══
function handleSplitSave() {
  console.log('[handleSplitSave] isCloudEditing:', isCloudEditing.value, 'postStatus:', postStatus.value, 'postId:', postId.value)
  if (isCloudEditing.value) {
    // Repo: save preserving current status
    const action = postStatus.value === 'published' ? 'publish' : 'draft'
    console.log('[handleSplitSave] → cloud save, action:', action)
    void doSave(action)
  } else {
    // Local: save to file
    console.log('[handleSplitSave] → local save')
    void saveLocalDirect()
  }
}

function openImportModal() {
  tempTitle.value = postTitle.value
  activeModal.value = 'import'
}

async function doImport() {
  // Apply modal fields
  if (tempTitle.value?.trim()) postTitle.value = tempTitle.value.trim()
  if (!postDate.value) postDate.value = new Date().toISOString()
  postStatus.value = 'published'

  // Use custom slug if user entered one; otherwise derive from title
  // (slugify falls back to a random UUID when the title has no readable characters).
  // Custom slug must pass the same validation as validateSlug().
  const fallbackSlug = slugify(postTitle.value || '')
  const custom = postSlug.value?.trim()
  const slugRe = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
  let slug = fallbackSlug
  if (custom && slugRe.test(custom) && custom.replace(/-/g, '').length >= 3) {
    slug = custom
  }
  const { readJson } = await import('../data/dataAccess')
  const idx: Record<string, any> = (await readJson('data/posts/index.json')) ?? {}
  if (idx[slug]) {
    let n = 2
    while (idx[`${slug}-${n}`]) n++
    slug = `${slug}-${n}`
  }
  postSlug.value = slug
  postId.value = slug // Important: set postId so savePost uses this slug

  // Copy local file references to post directory, preserving original filenames
  const imgRefs = [...localValue.value.matchAll(/!\[([^\]]*)\]\(([^)\s]+)/g)]
  console.log('[doImport] imgRefs:', imgRefs.map(m => ({ alt: m[1], url: m[2] })))
  if (imgRefs.length > 0) {
    const { copyToPost } = await import('../composables/editor/cloud/useCloudRelay')
    for (const m of imgRefs) {
      const altText = m[1]
      const url = m[2]
      const file = await getFileFromUrl(url, altText)
      if (file && (file as any).name) {
        const newName = await copyToPost(slug, file)
        if (newName) {
          localValue.value = localValue.value.split(url).join(newName)
        }
      }
    }
  }

  // doSave handles preSave → buildFileContent → savePost
  await doSave('publish')
  activeModal.value = 'none'
  // Switch to repo mode — navigate to the new post
  if (postId.value) {
    router.push({ path: editorBasePath + '/article', query: { id: postId.value } })
  }
}

// ═══ Handle unsaved option ═══
async function handleUnsavedOption(action: 'save' | 'discard') {
  if (action === 'save') {
    if (isCloudEditing.value) {
      const act = postStatus.value === 'published' ? 'publish' : 'draft'
      await doSave(act)
    } else { await saveLocalDirect() }
  }
  savedContent.value = localValue.value
  savedFm.value = buildSavedFm()
  activeModal.value = 'none'

  if (pendingActionCallback) { pendingActionCallback(); pendingActionCallback = null; return }
  if (pendingRoute.value) { router.push(pendingRoute.value); pendingRoute.value = null }
}

// ═══ Undo/Redo history ═══
const history = ref<string[]>([''])
const historyIndex = ref(0)
const isTimeTraveling = ref(false)
function pushHistory(val: string) {
  if (isTimeTraveling.value) return
  if (historyIndex.value >= 0 && history.value[historyIndex.value] === val) return
  if (historyIndex.value < history.value.length - 1) history.value = history.value.slice(0, historyIndex.value + 1)
  history.value.push(val)
  if (history.value.length > 50) { history.value.shift(); historyIndex.value-- }
  historyIndex.value = history.value.length - 1
}
const debouncedPush = debounce(pushHistory, 500)

// ═══ Watchers ═══
watch(dataReady, (val) => { if (val) emit('ready') })
watch(() => props.modelValue, (val) => { if (val !== localValue.value) localValue.value = val })
watch(localValue, (val) => {
  emit('update:modelValue', val)
  if (!isTimeTraveling.value) debouncedPush(val)
})
watch(fmChanged, () => {}, { flush: 'sync' })

// Sync post slug to preview renderer for private asset resolution
watch([postSlug, postId], () => {
  setPreviewPostId(postSlug.value || postId.value || '')
}, { immediate: true })

// Popstate handler — 浏览器前进后退时触发 initLoad。
function onPopstate() {
  if (route.path.startsWith(editorBasePath) && route.path !== editorBasePath + '/print') {
    initLoad()
  }
}
window.addEventListener('popstate', onPopstate)

// Load slug when opening an existing post (id IS the slug)
watch(() => postId.value, (id) => {
  if (id) postSlug.value = id
})

// Route query watch — initLoad 内部 router.replace 不触发 popstate，需手动监听。
// 仅监听 query.id 变化，忽略同值替换（Vue Router 同值不触发）。
watch(() => route.query.id, (newId, oldId) => {
  if (newId && newId !== oldId && route.path.startsWith(editorBasePath)) {
    initLoad()
  }
})

// ═══ Navigation guards ═══
const handleNavigation = (to: any, _from: any, next: any) => {
  if (isDirty.value) { pendingRoute.value = to; activeModal.value = 'unsaved'; next(false) }
  else next()
}
onBeforeRouteLeave(handleNavigation)
onBeforeRouteUpdate(async (to, _from, next) => {
  if (isDirty.value) { pendingRoute.value = to; activeModal.value = 'unsaved'; next(false) }
  else next()
})

// ═══ Toolbar config ═══
onMounted(loadToolbarConfig)
watch(bodyKey, () => { loadToolbarConfig() })

// ═══ Keyboard & lifecycle ═══
function handleBeforeUnload(e: BeforeUnloadEvent) {
  if (isDirty.value) { e.preventDefault(); e.returnValue = '' }
}

function onKeydown(e: KeyboardEvent) {
  const key = (e.key || '').toLowerCase()
  const mod = e.ctrlKey || e.metaKey
  if (mod && key === 'a') {
    const ed = editorBodyRef.value?.editorRef as any
    const active = document.activeElement
    const cmEl = document.querySelector('.blog-editor .cm-editor')
    const inEditor = cmEl && (active === cmEl || cmEl.contains(active as Node))
    if (!inEditor) { e.preventDefault(); e.stopPropagation(); ed?.focus?.(); setTimeout(() => document.execCommand('selectAll'), 0) }
    return
  }
  if (!mod) return
  if (key === 'z') { e.preventDefault(); e.stopPropagation(); undo(); return }
  if (key === 'y') { e.preventDefault(); e.stopPropagation(); redo(); return }
  if (key === 'f' || key === 'h') {
    e.preventDefault(); e.stopPropagation()
    const cmView = (editorBodyRef.value?.editorRef as any)?.getEditor?.()
    const dom = cmView?.contentDOM
    if (dom) { dom.focus(); dom.dispatchEvent(new KeyboardEvent('keydown', { key, ctrlKey: true, bubbles: true })) }
    return
  }
  if (key === 's') {
    e.preventDefault(); e.stopPropagation()
    if (e.shiftKey) { saveAs(); return }
    if (!isCloudEditing.value) { void saveLocalDirect() }
    else {
      const act = postStatus.value === 'published' ? 'publish' : 'draft'
      void doSave(act)
    }
    return
  }
  if (key === 'p') { e.preventDefault(); e.stopPropagation(); openPrintPreview(); return }
}

function onEditorKeydown(e: KeyboardEvent) {
  if (e.key === 'Tab' && !e.ctrlKey && !e.metaKey && !e.altKey) {
    e.preventDefault(); e.stopPropagation()
    const ed = editorBodyRef.value?.editorRef as any
    ed?.focus?.()
    ed?.insertAtCursor?.(e.shiftKey ? '' : '\t')
  }
}

onMounted(() => {
  initLoad()
  nc.registerAction('retry-build', () => { triggerAstroBuild(postId.value || '') })
  try {
    watch(() => locale.value, () => {
      if (isDefaultTitle.value) postTitle.value = t('editor.untitled')
    })
  } catch {}

  const checkTabOverflow = () => { tabsOverflow.value = window.innerWidth < 864 }
  checkTabOverflow()
  window.addEventListener('resize', checkTabOverflow)
  window.addEventListener('beforeunload', handleBeforeUnload)
  window.addEventListener('keydown', onKeydown)
  ;(window as any).__chronicleDirty = isDirty.value
  watch(isDirty, (val) => { ;(window as any).__chronicleDirty = val })

  const blogEl = document.querySelector('.blog-editor')
  if (blogEl) {
    blogEl.addEventListener('paste', onEditorPaste as EventListener, true)
    blogEl.addEventListener('drop', onEditorDropCapture as EventListener, true)
    blogEl.addEventListener('keydown', onEditorKeydown as EventListener, true)
  }
})

onUnmounted(() => {
  ;(window as any).__chronicleDirty = false
  window.removeEventListener('beforeunload', handleBeforeUnload)
  window.removeEventListener('keydown', onKeydown)
  const blogEl = document.querySelector('.blog-editor')
  if (blogEl) {
    blogEl.removeEventListener('paste', onEditorPaste as EventListener, true)
    blogEl.removeEventListener('drop', onEditorDropCapture as EventListener, true)
    blogEl.removeEventListener('keydown', onEditorKeydown as EventListener, true)
  }
  if (skeletonTimer.current) clearTimeout(skeletonTimer.current)
})
</script>
<style scoped>
@media (max-width: 600px) {
    .ribbon-title-input {
        display: none;
    }
}

.blog-editor {
    display: flex;
    flex-direction: column;
    height: var(--app-height);
    /* ensure editor fills viewport so internal panes scroll, not the page */
    border: none;
    background: var(--app-bg-pri);
}

/* ═══ Ribbon Toolbar ═══ */
.editor-ribbon {
    display: flex;
    align-items: center;
    gap: 0;
    padding: 8px 12px 6px 8px;
    height: 36px;
    position: sticky;
    top: 0;
    z-index: 30;
    user-select: none;
}

.ribbon-qat {
    display: flex;
    align-items: center;
    gap: 0;
    flex-shrink: 0;
}

.ribbon-tabs {
    display: flex;
    align-items: center;
    margin-left: 12px;
    gap: 2px;
    flex-shrink: 1;
    overflow-x: auto;
    min-width: 0;
}

.ribbon-tabs::-webkit-scrollbar {
    height: 4px;
}



.ribbon-tabs[data-overflow="true"] {
    overflow:visible;
}


.ribbon-tab {
    display: inline-flex;
    border-radius: 0;
    align-items: center;
    gap: 4px;
    padding: 4px 12px;
    height: 32px;
    background: transparent;
    border: none;
    border-bottom: 2px solid transparent;
    color: var(--comp-text-sec);
    cursor: pointer;
    font-size: 13px;
    font-weight: 500;
    transition: background 0.15s, border-color 0.15s;
}

.ribbon-tab:hover {
    border-bottom-color: var(--comp-text-sec);
    color: var(--app-text-pri);
}

.ribbon-tab.active {
    color: var(--app-text-pri);
    border-bottom-color: var(--accent);
    font-weight: 600;
}

.icon-svg.ribbon-tab-chevron {
    color: var(--comp-text-sec);
    flex-shrink: 0;
}


.tab-icon {
    width: 14px;
    height: 14px;
    opacity: 0.7;
}

.ribbon-right {
    display: flex;
    align-items: center;
    gap: 2px;
    margin-left: auto;
    flex-shrink: 0;
}

.ribbon-title-area {
    display: flex;
    align-items: center;
    gap: 8px;
    max-width: 240px;
    flex-shrink: 1;
    min-width: 60px;
}

.ribbon-title-input {
    background: transparent;
    border: 1px solid transparent;
    color: var(--app-text-pri);
    font-size: 13px;
    font-weight: 600;
    padding: 2px 6px;
    border-radius: 3px;
    width: 100%;
    outline: none;
    min-width: 0;
}

.ribbon-title-input:hover {
    border-color: var(--border-color);
}

.ribbon-title-input:focus {
    border-color: var(--comp-bg-accent);
    background: var(--app-bg-pri);
}

.ribbon-title-input[readonly] {
    cursor: default;
    border: none;
}

.ribbon-status {
    font-size: 10px;
    padding: 4px 6px;
    border-radius: 4px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.4px;
    white-space: nowrap;
    flex-shrink: 0;
    line-height: 1;
}

.ribbon-status.clickable {
    cursor: pointer;
    user-select: none;
}
.ribbon-status.clickable:hover {
    filter: brightness(0.9);
}

.ribbon-status.local {
    color: var(--app-text-pri);
    background: transparent;
    border: 1px solid var(--app-text-pri);
}

.ribbon-status.draft {
    color: var(--comp-text-sec);
    background: var(--comp-bg-hvr);
    border: 1px solid var(--comp-bg-hvr);
}

.ribbon-status.published {
    color: var(--status-success);
    background: var(--status-success-bg);
    border: 1px solid var(--status-success);
}

.ribbon-save-status {
    width: 18px;
    height: 18px;
    margin-right: 4px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    color: var(--status-success);
    transition: color 0.15s, opacity 0.15s;
}

.ribbon-save-status .icon-svg {
    width: 18px;
    height: 18px;
}

.ribbon-save-status.saving {
    animation: save-pulse 1.2s ease-in-out infinite;
}

.ribbon-save-status.building {
    color: var(--status-progress);
    animation: spin 2s linear infinite;
}

.ribbon-save-status.dirty {
    color: var(--app-text-pri);
}

.ribbon-save-status.new {
    color: color-mix(in srgb, var(--app-text-pri) 40%, transparent);
}

.ribbon-save-status {
    cursor: pointer;
}

.status-popover {
    position: absolute;
    top: 100%;
    right: 160px;
    margin-top: 6px;
    min-width: 220px;
    background: var(--comp-bg-blur);
    border: 1px solid var(--border-color);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border-radius: 8px;
    box-shadow: var(--shadow-elev-3);
    padding: 12px 14px;
    z-index: 200;
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-size: 0.82rem;
}

.status-popover-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 16px;
}

.status-popover-label {
    color: var(--comp-text-sec);
    flex-shrink: 0;
}

    /* Stats popover rows -- slot content of ToolDropdown, styled here (scoped CSS does not reach slots) */
    .tool-dropdown-stat {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 16px;
    padding: 6px 12px;
    font-size: 0.82rem;
    }
    .tool-dropdown-stat :deep(.stat-num) {
    font-variant-numeric: tabular-nums;
    color: var(--accent);
    font-weight: 500;
    }

@keyframes spin {
    to {
        transform: rotate(360deg);
    }
}

@keyframes save-pulse {

    0%,
    100% {
        opacity: 1;
    }

    50% {
        opacity: 0.2;
    }
}

.ribbon-sep {
    width: 1px;
    height: 18px;
    background: var(--border-color);
    margin: 0 2px;
    flex-shrink: 0;
}

.ribbon-sep--large {
    height: 28px;
    margin: 0 4px;
}

.ribbon-spacer {
    flex: 1;
}

.ribbon-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    background: transparent;
    border: 1px solid transparent;
    color: var(--comp-text-pri);
    cursor: pointer;
    padding: 0 8px;
    border-radius: 4px;
    height: 28px;
    font-size: 13px;
    white-space: nowrap;
    transition: background 0.15s, color 0.15s, border-color 0.15s, opacity 0.15s;
    box-sizing: border-box;
    vertical-align: middle;
}

.ribbon-btn:hover:not(:disabled):not(.active) {
    background: var(--hover);
    border-color: transparent;
}

.ribbon-btn.active {
    background: var(--comp-bg-accent-blur);
    color: var(--comp-text-pri-hl);
    border: 1px solid var(--comp-bg-accent);
}

.ribbon-btn:disabled {
    opacity: 0.3;
    cursor: not-allowed;
    border-color: transparent;
    pointer-events: none;
}

.btn-label {
    font-size: 13px;
    font-weight: 600;
}

.build-hint {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 11px;
    color: var(--comp-text-sec);
}

.ribbon-btn-pri {
    background: var(--accent);
    border-color: var(--accent);
    color: #fff;
    font-weight: 600;
}

.ribbon-btn-pri:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    border-color: var(--accent);
    pointer-events: none;
}

.ribbon-btn.ribbon-btn-pri:hover:not(:disabled) {
    background: color-mix(in srgb, var(--accent) 80%, var(--comp-text-pri));
}

/* ── Split save button ── */
.ribbon-split-btn {
    display: inline-flex;
    align-items: center;
    position: relative;
}
.ribbon-split-btn > .ribbon-btn-pri:first-child {
    border-top-right-radius: 0;
    border-bottom-right-radius: 0;
    border-right: 1px solid rgba(255,255,255,0.25);
}
.ribbon-split-btn .split-chevron {
    border-top-left-radius: 0;
    border-bottom-left-radius: 0;
    padding: 0;
    min-width: 24px;
}
.ribbon-split-btn .split-chevron .icon-svg {
    width: 14px;
    height: 14px;
}
.ribbon-split-btn .save-dropdown {
    position: absolute;
    top: 100%;
    right: 0;
    margin-top: 4px;
    min-width: 180px;
    z-index: 1001;
}

.ribbon-btn-danger {
    color: var(--status-error);
}

.ribbon-btn.ribbon-btn-danger:hover:not(:disabled) {
    background:  var(--status-error-bg) ;
}

.ribbon-btn-lg {
    height: 50px;
    flex-direction: column;
    gap: 2px;
    padding: 4px 10px;
    min-width: 50px;
}

.ribbon-btn-label {
    font-size: 12px;
    opacity: 0.8;
}

.ribbon-btn-wordcount {
    font-size: 11px;
    color: var(--comp-text-sec);
    padding: 3px 10px;
}

.ribbon-more {
    position: relative;
}

.dropdown-backdrop {
    position: fixed;
    inset: 0;
    z-index: 199;
}

.ribbon-more--left .more-dropdown {
    left: 0;
    right: auto;
}

.more-dropdown {
    position: absolute;
    right: 0;
    top: 100%;
    margin-top: 4px;
    min-width: 185px;
    background: var(--comp-bg-blur);
    border: 1px solid var(--border-color);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border-radius: 8px;
    box-shadow: var(--shadow-elev-3);
    padding: 6px;
    z-index: 200;
    display: flex;
    flex-direction: column;
    gap: 2px;
}

.more-dropdown button {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    text-align: left;
    padding: 6px 12px;
    border: none;
    border-radius: 6px;
    background: transparent;
    color: var(--app-text-pri);
    cursor: pointer;
    font-size: 0.8rem;
}

.more-dropdown button:disabled {
    opacity: 0.3;
    cursor: not-allowed;
    pointer-events: none;
}

.more-dropdown button:hover {
    background: var(--hover);
}

.more-dropdown button.active {
    background: var(--comp-bg-accent-blur);
    color: var(--comp-text-pri-hl);
    border: 1px solid var(--comp-bg-accent);
}

.more-dropdown hr {
    margin: 3px 0;
    border: none;
    border-top: 1px solid var(--border-color);
}

.more-dropdown .icon-svg {
    width: 16px;
    height: 16px;
    opacity: 0.65;
    flex-shrink: 0;
}

/* ── more-dropdown 打开/关闭动画 ── */
:deep(.dropdown-enter-active) {
    transition: opacity 0.15s ease, transform 0.15s ease;
}
:deep(.dropdown-leave-active) {
    transition: opacity 0.1s ease, transform 0.1s ease;
}
:deep(.dropdown-enter-from) {
    opacity: 0;
    transform: translateY(-4px);
}
:deep(.dropdown-leave-to) {
    opacity: 0;
    transform: translateY(-4px);
}

.more-locale-row {
    font-size: 0.8rem;
    padding: 6px 12px;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 6px 12px;
    font-size: 0.8rem;
}

.more-locale-row select {
    flex: 1;
    padding: 4px 8px;
    border: 1px solid var(--border-color);
    border-radius: 6px;
    background: var(--app-bg-pri);
    color: var(--app-text-pri);
    font-size: 0.8rem;
    outline: none;
    cursor: pointer;
}

/* ═══ Ribbon Content (tab area) ═══ */
.ribbon-content {
    background: var(--comp-bg-blur);
    backdrop-filter: blur(6px);
    border: 1px solid var(--border-color);
    box-shadow: var(--shadow-elev-2);
    border-radius: 12px;
    min-height: 52px;
    position: relative;
    top: 0px;
    margin: 0 8px;
    z-index: 29;
}

.ribbon-group-row {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 12px;
    height: 60px;
    overflow-x: auto;
}

.ribbon-group {
    display: flex;
    align-items: center;
    gap: 2px;
}

/* ═══ Legacy Toolbar Button (kept for modals that reuse) ═══ */
.toolbar-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    background: transparent;
    border: 1px solid transparent;
    color: var(--comp-text-pri);
    cursor: pointer;
    padding: 4px 8px;
    border-radius: 4px;
    height: 28px;
    font-size: 14px;
}

.toolbar-btn:hover:not(:disabled) {
    background: var(--hover);
}

.toolbar-btn.active {
    background: var(--comp-bg-accent-blur);
    border-color: var(--comp-bg-accent);
}

.toolbar-btn:disabled {
    opacity: 0.3;
    cursor: not-allowed;
    pointer-events: none;
}

/* editor workspace + pane + search-float styles moved to EditorArticleBody.vue */

.modal-content {
    background: var(--comp-bg-sec);
    border: 1px solid var(--border-color);
    border-radius: 6px;

    /* Adaptive Size */
    width: auto;
    min-width: 350px;
    max-width: 90vw;
    height: auto;

    display: flex;
    flex-direction: column;
    box-shadow: var(--shadow-elev-2);
    overflow: hidden;
}

.modal-math-textarea {
    font-family: var(--app-font-stack-mono);
    font-size: 14px;
    min-height: 60px;
}

/* Default larger modal preference if not specified small */
.modal-content:has(.media-manager-layout) {
    /* Fallback */
    width: 800px;
}

.large-modal {
    width: 800px;
    height: auto;
    min-height: 0;
    /* Ensure space for sidebar */
    max-width: 95vw;
}

.small-modal {
    width: auto;
    min-width: 380px;
    max-width: 500px;
}

.modal-header {
    padding: 0px 16px;
    border-bottom: 1px solid var(--border-color);
    display: flex;
    justify-content: space-between;
    align-items: center;
    background: var(--comp-bg);
    flex-shrink: 0;
    height: 48px;
}

.modal-header h3 {
    margin: 0;
    font-size: 16px;
    color: var(--comp-text-pri);
}

.close-btn {
    background: none;
    border: none;
    color: var(--comp-text-sec);
    cursor: pointer;
    padding: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 4px;
}

.close-btn:hover {
    background: transparent;
    color: var(--app-text-pri);
}

.close-btn :deep(svg) {
    min-width: 20px;
    min-height: 20px;
}

.modal-body {
    padding: 16px;
    overflow-y: auto;
    overflow-x: hidden;
}

.modal-body.media-manager-layout {
    display: flex;
    flex: 1;
    padding: 0;
    overflow: hidden;
}

/* Sidebar */
.modal-sidebar {
    width: 200px;
    background: var(--comp-bg-sec);
    border-right: 1px solid var(--border-color);
    padding: 10px;
    overflow-y: auto;
    flex-shrink: 0;
}

.modal-sidebar-item {
    padding: 6px 12px;
    cursor: pointer;
    border-radius: 4px;
    margin-bottom: 2px;
    display: flex;
    align-items: center;
    color: var(--comp-text-pri);
    font-size: 14px;
}

.modal-sidebar-item:hover {
    background: var(--hover);
}

.modal-sidebar-item.active {
    background: var(--comp-bg-accent-blur);
    border: 1px solid var(--comp-bg-accent);
}

.modal-sidebar-item.active:hover {
    background: var(--comp-bg-accent);
}

.toolbar-btn.primary-action {
    background: var(--accent);
    color: #fff;
}

.toolbar-btn.primary-action:hover {
    background: var(--accent-hvr);
}

.media-cat-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    margin-right: 10px;
}

.media-cat-icon :deep(svg) {
    width: 100%;
    height: 100%;
}

/* Content Area */
.media-content-area {
    flex: 1;
    display: flex;
    flex-direction: column;
    padding: 20px;
    background: var(--app-bg-pri);
    overflow: hidden;
}

.media-toolbar {
    margin-bottom: 20px;
    display: flex;
    justify-content: flex-start;
}


.primary-btn {
    background: var(--accent);
    color: #fff;
    border: none;
    padding: 8px 16px;
    cursor: pointer;
}

.primary-btn:hover {
    background: var(--accent-hvr);
}

.hidden-input {
    display: none;
}


.empty-library {
    text-align: center;
    color: var(--comp-text-sec);
    padding: 20px;
}

.scalable-icon {
    width: 40px;
    height: 40px;
    display: block;
}

.scalable-icon :deep(svg) {
    width: 100%;
    height: 100%;
    stroke-width: 1;
}

.icon-svg {
    display: inline-flex;
    width: 18px;
    height: 18px;
    align-items: center;
    justify-content: center;
    color: inherit;
}

.icon-svg svg {
    width: 100%;
    height: 100%;
    stroke-width: 1.5;
}

.icon-svg.sidebar-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    margin-right: 10px;
}

.status-chip {
    letter-spacing: 0.5px;
    white-space: nowrap;
    flex-shrink: 0;
}

.status-chip.local {
    color: var(--app-text-pri);
    background: transparent;
    border: 1px solid var(--app-text-pri);
}

.status-chip.draft {
    color: var(--comp-text-sec);
    background: var(--comp-bg-hvr);
}

.status-chip.published {
    color: var(--status-success);
    background: var(--status-success-bg);
    border: 1px solid var(--status-success);
}

.toolbar-btn.danger-btn {
    color: var(--status-error);
}

.toolbar-btn.danger-btn:hover:not(:disabled) {
    background: var(--status-error-bg);
    color: var(--status-error);
}

.small-modal {
    max-width: 500px;
    width: 90%;
}

.modal-content {
    background: var(--app-bg-sec);
    border: 1px solid var(--border-color);
    border-radius: 6px;
    box-shadow: var(--shadow-elev-2);
    padding: 0;
    width: 80%;
    max-width: 900px;
    display: flex;
    flex-direction: column;
}

.form-group {
    margin-bottom: 12px;
}

.form-group label:not(.check-row) {
    display: block;
    margin-bottom: 8px;
    font-size: 14px;
    color: var(--comp-text-pri);
}

.modal-input {
    width: 100%;
    /* Ensure no overflow */
    box-sizing: border-box;
    padding: 8px 12px;
    font-size: .95rem;
    background: var(--comp-bg-inset);
    border: 1px solid var(--border-color);
    color: var(--app-text-pri);
    border-radius: 8px;
    outline: none;
    box-shadow: var(--comp-inset-shadow);
}

.modal-input:focus {
    border-color: var(--accent);
}

.modal-input:disabled {
    opacity: .5;
    cursor: not-allowed;
    background: var(--comp-bg);
    box-shadow: none;
}

.modal-input.input-error {
    border-color: #e15759;
    box-shadow: 0 0 0 1px #e15759;
    transition: border-color .15s, box-shadow .15s;
}

.modal-actions {
    display: flex;
    justify-content: flex-end;
    gap: 10px;
    margin-top: 12px;
}

.secondary-btn {
    background: transparent;
    border: 1px solid var(--border-color);
    color: var(--comp-text-pri);
    padding: 8px 16px;
    cursor: pointer;
}

.secondary-btn:hover {
    background: var(--hover);
}

/* Table Grid Styles */
.table-grid-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    margin-bottom: 20px;
}

.table-grid {
    display: grid;
    grid-template-columns: repeat(8, 24px);
    gap: 4px;
    padding: 10px;
    background: var(--app-bg-sec);
    border: 1px solid var(--border-color);
    border-radius: 4px;
}

.grid-cell {
    width: 24px;
    height: 24px;
    border: 1px solid var(--border-color);
    background: var(--comp-bg-glass);
    cursor: pointer;
    border-radius: 2px;
}

.grid-cell:hover {
    border-color: var(--comp-bg-accent);
}

.grid-cell.active {
    background: var(--comp-bg-accent-blur);
    border-color: var(--comp-bg-accent);
}

.grid-info {
    font-size: 13px;
    color: var(--comp-text-pri);
    font-weight: 500;
    font-variation-settings: 'wght' 500;
}

.manual-inputs {
    display: flex;
    gap: 15px;
    justify-content: center;
    margin-bottom: 20px;
}

.manual-inputs .form-group {
    flex-direction: row;
    align-items: center;
    gap: 8px;
    margin-bottom: 0;
}

.manual-inputs input {
    width: 60px;
    text-align: center;
}

/* Tags Style */
.tags-input-container {
    display: flex;
    flex-direction: column;
    gap: 8px;
    background: var(--comp-bg-glass);
    padding: 6px;
    border-radius: 8px;
    border: 1px solid var(--border-color);
}

.tags-list {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    min-height: 0px;
}

.tag-badge {
    background: var(--accent-bg);
    color: var(--comp-text-pri);
    font-size: 12px;
    padding: 2px 8px 2px 10px;
    border-radius: 4px;
    display: flex;
    align-items: center;
    gap: 6px;
    border: none;
    user-select: none;
    min-height: 0;
}

.tag-badge.featured {
    background: var(--featured-bg);
    color: var(--featured);
    border-color: var(--featured);
}

.tag-remove {
    background: none;
    border: none;
    color: var(--comp-text-sec);
    cursor: pointer;
    padding: 0;
    display: flex;
    align-items: center;
    width: 14px;
    height: 14px;
}

.tag-badge.featured .tag-remove {
    color: var(--featured);
}

.tag-remove:hover {
    color: var(--app-text-pri);
}

.tag-remove .icon-svg, .tag-remove :deep(svg){
    width: 14px;
    height: 14px;
}

.tag-controls {
    display: flex;
    gap: 8px;
}

.small-input {
    padding: 6px 10px;
    font-size: 13px;
    flex: 1;
}

.small-btn {
    padding: 6px 12px;
    font-size: 13px;
    border-color: var(--border-color-blur);
}

.small-btn.active {
    background: var(--featured-bg);
    color: var(--featured);
    border-color: var(--featured);
}

.primary-btn.danger-action {
    background: var(--status-error);
}

.primary-btn.danger-action:hover {
    background: var(--status-error);
    filter: brightness(0.92);
}

/* File Menu Specifics */
.modal-content.file-menu-modal {
    flex-direction: row;
    height: 600px;
}

.file-menu-sidebar {
    width: 200px;
    background: var(--app-bg-sec);
    margin: .2rem;
    box-shadow: none;
    border: none;
    padding: 14px;
    display: flex;
    flex-direction: column;
}

.sidebar-btn {
    padding: 6px 12px;
    background: transparent;
    cursor: pointer;
    border-radius: 4px;
    margin-bottom: 4px;
    display: flex;
    align-items: center;
    color: var(--comp-text-pri);
    font-size: 14px;
}

.sidebar-btn:hover {
    background: var(--hover);
    color: var(--app-text-pri);
}

.sidebar-btn.active {
    background: var(--comp-bg-accent-blur);
    border: 1px solid var(--comp-bg-accent);
}

.sidebar-btn.active:hover {
    background: var(--comp-bg-accent);
}

.main-area {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
}

.header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 1px solid var(--border-color);
    padding: 15px;
}

.header h3 {
    margin: 0;
    color: var(--app-text-pri);
    font-size: 18px;
}

.content-body {
    flex: 1;
    overflow-y: auto;
    margin-top: 0;
    padding: 10px 20px;
}

.warning-box {
    background: var(--featured-bg);
    border-left: 3px solid var(--featured);
    padding: 10px;
    margin: 15px 0;
    color: var(--comp-text-pri);
    font-size: 13px;
}

.new-doc-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
    margin: 12px 0;
}

.new-doc-col {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.new-doc-label {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--comp-text-sec);
    margin-bottom: 2px;
}

.post-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.post-item {
    padding: 12px;
    background: var(--comp-bg-glass);
    border: 1px solid var(--border-color);
    border-radius: 4px;
    cursor: pointer;
    display: flex;
    justify-content: space-between;
    align-items: center;
    transition: background 0.2s;
}

.post-item:hover {
    background: var(--comp-bg-glass-hvr);
}

.post-title {
    font-size: 1rem;
    font-weight: bold;
    font-variation-settings: 'wght' 600;
    color: var(--app-text-pri);
    flex: 1;
    margin: 0 10px 0 0;
}

.post-date {
    color: var(--comp-text-sec);
    font-size: 0.85em;
    margin-right: 10px;
}

.post-status {
    font-size: 0.75em;
    border-radius: 3px;
    padding: 2px 6px;
    text-transform: uppercase;
    margin-right: 10px;
}

.file-drop-area {
    border: 2px dashed var(--border-color);
    padding: 40px;
    text-align: center;
    color: var(--comp-text-sec);
    margin: 20px 0;
    cursor: pointer;
    border-radius: 6px;
}

.file-drop-area:hover {
    border-color: var(--accent);
    color: var(--comp-text-pri);
}

/* Font Selector */
.font-selector {
    display: flex;
    gap: 15px;
    margin-top: 5px;
}

.radio-label {
    display: flex;
    align-items: center;
    gap: 5px;
    cursor: pointer;
    font-size: 0.9em;
    color: var(--comp-text-pri);
}

.radio-label input {
    margin: 0;
}

/* Upload Toast */
.upload-toast {
    position: fixed;
    bottom: 24px;
    right: 24px;
    width: 320px;
    background: var(--comp-bg-sec);
    border: 1px solid var(--border-color);
    border-radius: 4px;
    box-shadow: var(--shadow-elev-1);
    z-index: 2000;
    overflow: hidden;
    animation: slideIn 0.3s ease-out;
    color: var(--comp-text-pri);
    font-size: 13px;
}

.upload-toast.error {
    border-left: 4px solid var(--status-error);
}

.upload-toast.success {
    border-left: 4px solid var(--status-success);
}

.upload-toast.uploading,
.upload-toast.processing {
    border-left: 4px solid var(--accent);
}

.toast-content {
    padding: 12px 16px;
}

.toast-header-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;
}

.toast-title {
    font-weight: 600;
    color: var(--app-text-pri);
}

.toast-close {
    background: none;
    border: none;
    cursor: pointer;
    color: var(--comp-text-sec);
    padding: 0;
    line-height: 0;
    display: flex;
    align-items: center;
    justify-content: center;
}

.toast-close:hover {
    color: var(--app-text-pri);
}

.toast-close .icon-svg {
    width: 14px;
    height: 14px;
    fill: currentColor;
}

.toast-message {
    color: var(--comp-text-sec);
    margin-bottom: 12px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.toast-progress-bg {
    height: 4px;
    background: var(--comp-bg-sec);
    border-radius: 2px;
    overflow: hidden;
}

.toast-progress-bar {
    height: 100%;
    background: var(--accent);
    transition: width 0.2s ease;
}

.confirm-text {
    color: var(--comp-text-pri);
    margin-bottom: 20px;
}

.danger-outline {
    border-color: var(--status-error);
    color: var(--status-error);
}

.danger-outline:hover {
    background: var(--status-error);
    border-color: var(--status-error);
    color: #fff;
}

.locale-select {
    transition: background 0.2s;
    display: flex;
    justify-content: center;
    text-align: start;
}

.locale-select option {
    background: var(--app-bg-sec);
    color: var(--comp-text-pri);
}

.math-preview {
    background: var(--comp-bg-glass);
    border-radius: 8px;
    padding: 10px;
    margin-top: 10px;
    min-height: 60px;
    display: flex;
    align-items: center;
    justify-content: center;
}

.math-options { display: flex; gap: 20px; margin-top: 2px; }

input[type="radio"] {
    accent-color: var(--accent);
    height: 16px;
    width: 16px;
    transform: translateY(2px);
}

@keyframes slideIn {
    from {
        transform: translateY(20px);
        opacity: 0;
    }

    to {
        transform: translateY(0);
        opacity: 1;
    }
}

/* ── Editor body wrapper ───────────────────────────── */
.editor-body-wrapper {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

</style>