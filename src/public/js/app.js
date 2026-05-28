/**
 * Lead Scraper Dashboard Application
 */

class LeadScraperApp {
  constructor() {
    this.currentPage = 1;
    this.currentFilters = {};
    this.currentLimit = 50;
    this.totalLeads = 0;
    this.pollingInterval = null;
    this.currentJobId = null;
    this.currentLeadId = null;
    this.debounceTimer = null;

    this.init();
  }

  init() {
    this.bindNavigation();
    this.bindScrapeForm();
    this.bindFilters();
    this.bindModal();
    this.bindJobButtons();
    this.loadLeads();
    this.loadTotalCount();
    this.loadRecentJobs();
  }

  // ============================================================
  // Navigation
  // ============================================================

  bindNavigation() {
    document.querySelectorAll('.nav-link').forEach((link) => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const section = link.dataset.section;
        this.showSection(section);

        document.querySelectorAll('.nav-link').forEach((l) => l.classList.remove('active'));
        link.classList.add('active');
      });
    });
  }

  showSection(name) {
    document.querySelectorAll('.section').forEach((s) => {
      s.classList.add('hidden');
    });
    const target = document.getElementById(`section-${name}`);
    if (target) {
      target.classList.remove('hidden');
    }

    if (name === 'leads') this.loadLeads();
    if (name === 'jobs') this.loadAllJobs();
    if (name === 'stats') this.loadStats();
  }

  // ============================================================
  // Scraping Form
  // ============================================================

  bindScrapeForm() {
    const form = document.getElementById('scrapeForm');
    if (!form) return;

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      this.startScraping();
    });
  }

  async startScraping() {
    const profession = document.getElementById('profession').value.trim();
    const location = document.getElementById('location').value.trim();
    const source = document.getElementById('source').value;

    if (!profession || !location) {
      this.showToast('Please enter both profession and location.', 'warning');
      return;
    }

    const btn = document.getElementById('startBtn');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Starting...';

    try {
      const response = await this.apiRequest('/api/scrape', {
        method: 'POST',
        body: JSON.stringify({ profession, location, source }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Failed to start scraping');
      }

      const data = await response.json();
      this.currentJobId = data.jobId;

      this.showProgressSection(data.jobId, profession, location, source);
      this.pollJobStatus(data.jobId);
      this.showToast(`Scraping started! Job ID: ${data.jobId.slice(0, 8)}...`, 'success');
    } catch (err) {
      this.showToast(err.message, 'error');
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-play"></i> <span>Start Scraping</span>';
    }
  }

  showProgressSection(jobId, profession, location, source) {
    const section = document.getElementById('progressSection');
    section.classList.remove('hidden');

    document.getElementById('jobIdDisplay').textContent = `Job: ${jobId.slice(0, 8)}...`;
    document.getElementById('progressFill').style.width = '0%';
    document.getElementById('progressPercent').textContent = '0%';
    document.getElementById('progressStatus').textContent = `Searching ${profession} in ${location} via ${source}...`;
    document.getElementById('statFound').textContent = '0';
    document.getElementById('statSaved').textContent = '0';
    document.getElementById('statErrors').textContent = '0';

    const errDiv = document.getElementById('progressErrors');
    errDiv.classList.add('hidden');
    errDiv.innerHTML = '';
  }

  pollJobStatus(jobId) {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
    }

    this.pollingInterval = setInterval(async () => {
      try {
        const response = await this.apiRequest(`/api/jobs/${jobId}`);
        if (!response.ok) return;

        const job = await response.json();
        this.updateProgressUI(job);

        if (job.status === 'completed' || job.status === 'failed') {
          clearInterval(this.pollingInterval);
          this.pollingInterval = null;
          this.onJobComplete(job);
        }
      } catch (err) {
        console.error('Polling error:', err);
      }
    }, 2000);
  }

  updateProgressUI(job) {
    const progress = job.progress || 0;
    document.getElementById('progressFill').style.width = `${progress}%`;
    document.getElementById('progressPercent').textContent = `${progress}%`;
    document.getElementById('statFound').textContent = job.totalFound || 0;
    document.getElementById('statSaved').textContent = job.totalSaved || 0;
    document.getElementById('statErrors').textContent = job.errors ? job.errors.length : 0;

    const statusMessages = {
      pending: 'Initializing...',
      running: `Scraping in progress... (${progress}% complete)`,
      completed: 'Scraping completed!',
      failed: 'Scraping failed.',
    };

    document.getElementById('progressStatus').textContent =
      statusMessages[job.status] || job.status;

    // Show errors
    if (job.errors && job.errors.length > 0) {
      const errDiv = document.getElementById('progressErrors');
      errDiv.classList.remove('hidden');
      errDiv.innerHTML = `<strong><i class="fas fa-exclamation-triangle"></i> Errors:</strong><br>${job.errors.join('<br>')}`;
    }

    // Update progress header icon
    const header = document.querySelector('#progressSection .progress-header h2');
    if (header) {
      if (job.status === 'completed') {
        header.innerHTML = '<i class="fas fa-check-circle" style="color:var(--secondary)"></i> Scraping Complete';
      } else if (job.status === 'failed') {
        header.innerHTML = '<i class="fas fa-times-circle" style="color:var(--danger)"></i> Scraping Failed';
      } else {
        header.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Scraping in Progress';
      }
    }
  }

  onJobComplete(job) {
    const msg = job.status === 'completed'
      ? `Completed! Found ${job.totalFound} leads, saved ${job.totalSaved}.`
      : `Job failed. Check error details.`;

    this.showToast(msg, job.status === 'completed' ? 'success' : 'error');

    // Reload leads and jobs
    setTimeout(() => {
      this.loadLeads();
      this.loadRecentJobs();
      this.loadTotalCount();
    }, 1000);
  }

  // ============================================================
  // Leads
  // ============================================================

  bindFilters() {
    const applyBtn = document.getElementById('applyFiltersBtn');
    const clearBtn = document.getElementById('clearFiltersBtn');
    const searchInput = document.getElementById('searchInput');

    if (applyBtn) applyBtn.addEventListener('click', () => this.applyFilters());
    if (clearBtn) clearBtn.addEventListener('click', () => this.clearFilters());

    // Debounced search
    if (searchInput) {
      searchInput.addEventListener('input', () => {
        clearTimeout(this.debounceTimer);
        this.debounceTimer = setTimeout(() => this.applyFilters(), 400);
      });
    }

    // Enter key on filters
    ['filterStatus', 'filterSource', 'filterSort'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('change', () => this.applyFilters());
    });
  }

  applyFilters() {
    this.currentFilters = {
      search: document.getElementById('searchInput')?.value.trim() || '',
      status: document.getElementById('filterStatus')?.value || '',
      source: document.getElementById('filterSource')?.value || '',
      sort: document.getElementById('filterSort')?.value || 'scrapedDate',
    };
    this.currentPage = 1;
    this.loadLeads();
  }

  clearFilters() {
    const ids = ['searchInput', 'filterStatus', 'filterSource'];
    ids.forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    const sort = document.getElementById('filterSort');
    if (sort) sort.value = 'scrapedDate';
    this.currentFilters = {};
    this.currentPage = 1;
    this.loadLeads();
  }

  async loadLeads(page, filters) {
    page = page || this.currentPage;
    filters = filters || this.currentFilters;

    const params = new URLSearchParams({
      page: page.toString(),
      limit: this.currentLimit.toString(),
      sort: filters.sort || 'scrapedDate',
      order: 'desc',
    });

    if (filters.search) params.set('search', filters.search);
    if (filters.status) params.set('status', filters.status);
    if (filters.source) params.set('source', filters.source);
    if (filters.profession) params.set('profession', filters.profession);
    if (filters.location) params.set('location', filters.location);

    try {
      const response = await this.apiRequest(`/api/leads?${params.toString()}`);
      if (!response.ok) throw new Error('Failed to load leads');

      const data = await response.json();
      this.totalLeads = data.total;
      this.currentPage = data.page;

      this.renderTable(data.leads);
      this.renderPagination(data.total, data.page, data.limit, data.pages);
    } catch (err) {
      console.error('Load leads error:', err);
      this.renderTableError();
    }
  }

  renderTable(leads) {
    const tbody = document.getElementById('leadsTableBody');
    if (!tbody) return;

    if (!leads || leads.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="9" class="empty-row">
            <div class="empty-state">
              <i class="fas fa-database"></i>
              <p>No leads found. Try adjusting your filters or start a new scraping job.</p>
            </div>
          </td>
        </tr>`;
      return;
    }

    tbody.innerHTML = leads.map((lead) => this.renderLeadRow(lead)).join('');
  }

  renderLeadRow(lead) {
    const statusClass = `status-${lead.status || 'new'}`;
    const sourceClass = `source-${lead.source || 'direct'}`;
    const sourceLabel = this.formatSource(lead.source);
    const statusLabel = this.capitalize(lead.status || 'new');

    const ratingHtml = lead.rating != null
      ? `<div class="rating-display">
          <span class="rating-stars"><i class="fas fa-star"></i></span>
          <span class="rating-value">${Number(lead.rating).toFixed(1)}</span>
          ${lead.reviewCount ? `<span class="rating-count">(${lead.reviewCount})</span>` : ''}
        </div>`
      : `<span class="text-muted">—</span>`;

    const phoneHtml = lead.phone
      ? `<a href="tel:${lead.phone}" class="phone-link"><i class="fas fa-phone"></i>${lead.phone}</a>`
      : '<span class="text-muted">—</span>';

    const emailHtml = lead.email
      ? `<a href="mailto:${lead.email}" class="email-link"><i class="fas fa-envelope"></i><span class="truncate" style="max-width:130px">${lead.email}</span></a>`
      : '<span class="text-muted">—</span>';

    const location = [lead.city, lead.state].filter(Boolean).join(', ') || '—';

    const websiteHtml = lead.website
      ? `<a href="${lead.website}" class="website-link" target="_blank" rel="noopener"><i class="fas fa-external-link-alt"></i></a>`
      : '';

    const ownerHtml = lead.ownerName
      ? `<div class="contact-info">${this.escapeHtml(lead.ownerName)}</div>`
      : '';

    return `<tr>
      <td>
        <span class="business-name" title="${this.escapeHtml(lead.businessName)}">${this.escapeHtml(lead.businessName)}</span>
        ${ownerHtml}
      </td>
      <td>${websiteHtml}</td>
      <td>${phoneHtml}</td>
      <td>${emailHtml}</td>
      <td><span style="font-size:0.8rem">${this.escapeHtml(location)}</span></td>
      <td>${ratingHtml}</td>
      <td><span class="badge ${sourceClass}">${sourceLabel}</span></td>
      <td><span class="badge ${statusClass}">${statusLabel}</span></td>
      <td>
        <div class="action-buttons">
          <button class="btn btn-outline btn-xs" onclick="app.openLeadModal('${lead._id}')" title="View/Edit">
            <i class="fas fa-edit"></i>
          </button>
          <button class="btn btn-danger btn-xs" onclick="app.deleteLead('${lead._id}', '${this.escapeHtml(lead.businessName)}')" title="Delete">
            <i class="fas fa-trash"></i>
          </button>
        </div>
      </td>
    </tr>`;
  }

  renderTableError() {
    const tbody = document.getElementById('leadsTableBody');
    if (tbody) {
      tbody.innerHTML = `
        <tr>
          <td colspan="9" class="empty-row">
            <div class="empty-state">
              <i class="fas fa-exclamation-triangle" style="color:var(--danger)"></i>
              <p>Error loading leads. Please check your database connection.</p>
            </div>
          </td>
        </tr>`;
    }
  }

  renderPagination(total, page, limit, pages) {
    const bar = document.getElementById('paginationBar');
    if (!bar) return;

    if (total === 0) {
      bar.innerHTML = '';
      return;
    }

    const from = (page - 1) * limit + 1;
    const to = Math.min(page * limit, total);

    let html = `<div class="pagination-info">Showing ${from}–${to} of ${total} leads</div>`;
    html += '<div class="pagination-controls">';

    // Prev button
    html += `<button class="page-btn" ${page <= 1 ? 'disabled' : ''} onclick="app.goToPage(${page - 1})">
      <i class="fas fa-chevron-left"></i>
    </button>`;

    // Page buttons
    const range = this.getPageRange(page, pages);
    range.forEach((p) => {
      if (p === '...') {
        html += `<span class="page-btn" style="cursor:default;border:none;">...</span>`;
      } else {
        html += `<button class="page-btn ${p === page ? 'active' : ''}" onclick="app.goToPage(${p})">${p}</button>`;
      }
    });

    // Next button
    html += `<button class="page-btn" ${page >= pages ? 'disabled' : ''} onclick="app.goToPage(${page + 1})">
      <i class="fas fa-chevron-right"></i>
    </button>`;

    html += '</div>';
    bar.innerHTML = html;
  }

  getPageRange(page, pages) {
    if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);
    if (page <= 4) return [1, 2, 3, 4, 5, '...', pages];
    if (page >= pages - 3) return [1, '...', pages - 4, pages - 3, pages - 2, pages - 1, pages];
    return [1, '...', page - 1, page, page + 1, '...', pages];
  }

  goToPage(page) {
    this.currentPage = page;
    this.loadLeads(page, this.currentFilters);
  }

  // ============================================================
  // Export
  // ============================================================

  async exportLeads(format) {
    try {
      this.showToast(`Preparing ${format.toUpperCase()} export...`, 'info');

      const response = await this.apiRequest('/api/leads/export', {
        method: 'POST',
        body: JSON.stringify({
          format,
          filters: this.currentFilters,
        }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Export failed');
      }

      const blob = await response.blob();
      const ext = format === 'excel' ? 'xlsx' : format;
      const filename = `leads-${Date.now()}.${ext}`;

      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);

      this.showToast(`Export downloaded: ${filename}`, 'success');
    } catch (err) {
      this.showToast(err.message, 'error');
    }
  }

  // ============================================================
  // Lead Modal
  // ============================================================

  bindModal() {
    const closeBtn = document.getElementById('modalClose');
    const cancelBtn = document.getElementById('modalCancelBtn');
    const saveBtn = document.getElementById('modalSaveBtn');
    const overlay = document.getElementById('modalOverlay');

    const closeModal = () => this.closeLeadModal();

    if (closeBtn) closeBtn.addEventListener('click', closeModal);
    if (cancelBtn) cancelBtn.addEventListener('click', closeModal);
    if (overlay) overlay.addEventListener('click', closeModal);
    if (saveBtn) saveBtn.addEventListener('click', () => this.saveLeadModal());

    // ESC key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeModal();
    });
  }

  async openLeadModal(id) {
    this.currentLeadId = id;

    try {
      const response = await this.apiRequest(`/api/leads/${id}`);
      if (!response.ok) throw new Error('Lead not found');

      const lead = await response.json();
      this.renderLeadModal(lead);

      const modal = document.getElementById('leadModal');
      if (modal) modal.classList.remove('hidden');
    } catch (err) {
      this.showToast(err.message, 'error');
    }
  }

  renderLeadModal(lead) {
    const title = document.getElementById('modalTitle');
    const body = document.getElementById('modalBody');

    if (title) title.textContent = lead.businessName;

    const location = [lead.address, lead.city, lead.state, lead.zip].filter(Boolean).join(', ');
    const scrapedDate = lead.scrapedDate ? new Date(lead.scrapedDate).toLocaleString() : '—';

    body.innerHTML = `
      <div class="modal-section-title">Business Information</div>
      <div class="modal-grid">
        <div class="modal-field">
          <label>Business Name</label>
          <div class="field-value">${this.escapeHtml(lead.businessName)}</div>
        </div>
        <div class="modal-field">
          <label>Owner Name</label>
          <div class="field-value">${this.escapeHtml(lead.ownerName || '—')}</div>
        </div>
        <div class="modal-field">
          <label>Phone</label>
          <div class="field-value">
            ${lead.phone ? `<a href="tel:${lead.phone}">${this.escapeHtml(lead.phone)}</a>` : '—'}
          </div>
        </div>
        <div class="modal-field">
          <label>Email</label>
          <div class="field-value">
            ${lead.email ? `<a href="mailto:${lead.email}">${this.escapeHtml(lead.email)}</a>` : '—'}
          </div>
        </div>
        <div class="modal-field">
          <label>Website</label>
          <div class="field-value">
            ${lead.website ? `<a href="${lead.website}" target="_blank" rel="noopener">${this.escapeHtml(lead.website)}</a>` : '—'}
          </div>
        </div>
        <div class="modal-field">
          <label>Category</label>
          <div class="field-value">${this.escapeHtml(lead.category || '—')}</div>
        </div>
        <div class="modal-field full-width">
          <label>Address</label>
          <div class="field-value">${this.escapeHtml(location || '—')}</div>
        </div>
        <div class="modal-field">
          <label>Rating</label>
          <div class="field-value">
            ${lead.rating != null ? `<span style="color:var(--warning)"><i class="fas fa-star"></i></span> ${Number(lead.rating).toFixed(1)} ${lead.reviewCount ? `(${lead.reviewCount} reviews)` : ''}` : '—'}
          </div>
        </div>
        <div class="modal-field">
          <label>Source</label>
          <div class="field-value"><span class="badge source-${lead.source}">${this.formatSource(lead.source)}</span></div>
        </div>
        <div class="modal-field">
          <label>Profession</label>
          <div class="field-value">${this.escapeHtml(lead.profession)}</div>
        </div>
        <div class="modal-field">
          <label>Scraped Date</label>
          <div class="field-value">${scrapedDate}</div>
        </div>
      </div>

      <div class="modal-section-title">Update Lead</div>

      <div class="modal-edit-group">
        <label for="editStatus">Status</label>
        <select id="editStatus">
          <option value="new" ${lead.status === 'new' ? 'selected' : ''}>New</option>
          <option value="contacted" ${lead.status === 'contacted' ? 'selected' : ''}>Contacted</option>
          <option value="qualified" ${lead.status === 'qualified' ? 'selected' : ''}>Qualified</option>
          <option value="converted" ${lead.status === 'converted' ? 'selected' : ''}>Converted</option>
          <option value="rejected" ${lead.status === 'rejected' ? 'selected' : ''}>Rejected</option>
        </select>
      </div>

      <div class="modal-edit-group">
        <label>
          <input type="checkbox" id="editContacted" ${lead.contacted ? 'checked' : ''} style="margin-right:0.4rem"/>
          Mark as Contacted
        </label>
      </div>

      <div class="modal-edit-group">
        <label for="editNotes">Notes</label>
        <textarea id="editNotes" placeholder="Add notes about this lead...">${this.escapeHtml(lead.notes || '')}</textarea>
      </div>
    `;
  }

  async saveLeadModal() {
    if (!this.currentLeadId) return;

    const status = document.getElementById('editStatus')?.value;
    const notes = document.getElementById('editNotes')?.value || '';
    const contacted = document.getElementById('editContacted')?.checked || false;

    try {
      await this.updateLead(this.currentLeadId, { status, notes, contacted });
      this.closeLeadModal();
      this.loadLeads();
    } catch (err) {
      this.showToast(err.message, 'error');
    }
  }

  closeLeadModal() {
    const modal = document.getElementById('leadModal');
    if (modal) modal.classList.add('hidden');
    this.currentLeadId = null;
  }

  async updateLead(id, data) {
    const response = await this.apiRequest(`/api/leads/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error || 'Update failed');
    }

    this.showToast('Lead updated successfully', 'success');
    return await response.json();
  }

  async deleteLead(id, name) {
    if (!confirm(`Delete lead "${name}"? This cannot be undone.`)) return;

    try {
      const response = await this.apiRequest(`/api/leads/${id}`, { method: 'DELETE' });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Delete failed');
      }

      this.showToast('Lead deleted', 'success');
      this.loadLeads();
      this.loadTotalCount();
    } catch (err) {
      this.showToast(err.message, 'error');
    }
  }

  // ============================================================
  // Jobs
  // ============================================================

  bindJobButtons() {
    const refreshBtn = document.getElementById('refreshJobsBtn');
    const refreshAllBtn = document.getElementById('refreshAllJobsBtn');
    const refreshStatsBtn = document.getElementById('refreshStatsBtn');

    if (refreshBtn) refreshBtn.addEventListener('click', () => this.loadRecentJobs());
    if (refreshAllBtn) refreshAllBtn.addEventListener('click', () => this.loadAllJobs());
    if (refreshStatsBtn) refreshStatsBtn.addEventListener('click', () => this.loadStats());
  }

  // ============================================================
  // Stats
  // ============================================================

  async loadStats() {
    try {
      const response = await this.apiRequest('/api/stats');
      if (!response.ok) return;
      const data = await response.json();
      this.renderStats(data);
    } catch (err) {
      console.error('Load stats error:', err);
    }
  }

  renderStats(data) {
    const totalsEl = document.getElementById('statsTotals');
    if (totalsEl) {
      const t = data.totals || {};
      totalsEl.innerHTML = [
        { label: 'Total Leads', value: t.leads || 0 },
        { label: 'Total Jobs', value: t.jobs || 0 },
        { label: 'Verified', value: t.verified || 0 },
        { label: 'Contacted', value: t.contacted || 0 },
        { label: 'With Email', value: t.withEmail || 0 },
      ].map((tile) => `
        <div class="stats-tile">
          <div class="tile-value">${tile.value.toLocaleString()}</div>
          <div class="tile-label">${tile.label}</div>
        </div>`).join('');
    }

    const renderTable = (tableId, rows, keyA, keyB) => {
      const tbody = document.querySelector(`#${tableId} tbody`);
      if (!tbody) return;
      tbody.innerHTML = rows.length
        ? rows.map((r) => `<tr><td>${this.escapeHtml(r[keyA])}</td><td>${r[keyB]}</td></tr>`).join('')
        : '<tr><td colspan="2" style="color:var(--gray-400);text-align:center">No data</td></tr>';
    };

    renderTable('statsBySource', data.bySource || [], 'source', 'count');
    renderTable('statsByStatus', data.byStatus || [], 'status', 'count');
    renderTable('statsTopProfessions', data.topProfessions || [], 'profession', 'count');
  }

  async loadRecentJobs() {
    try {
      const response = await this.apiRequest('/api/jobs');
      if (!response.ok) return;

      const data = await response.json();
      this.renderJobsList('recentJobsList', data.jobs.slice(0, 5));
    } catch (err) {
      console.error('Load recent jobs error:', err);
    }
  }

  async loadAllJobs() {
    try {
      const response = await this.apiRequest('/api/jobs');
      if (!response.ok) return;

      const data = await response.json();
      this.renderJobsList('allJobsList', data.jobs);
    } catch (err) {
      console.error('Load all jobs error:', err);
    }
  }

  renderJobsList(containerId, jobs) {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (!jobs || jobs.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <i class="fas fa-inbox"></i>
          <p>No jobs found.</p>
        </div>`;
      return;
    }

    container.innerHTML = jobs.map((job) => this.renderJobCard(job)).join('');
  }

  renderJobCard(job) {
    const icons = { pending: 'fa-clock', running: 'fa-spinner fa-spin', completed: 'fa-check', failed: 'fa-times' };
    const icon = icons[job.status] || 'fa-circle';
    const date = new Date(job.createdAt).toLocaleString();
    const sourceLabel = this.formatSource(job.source);
    const duration = job.completedAt && job.startedAt
      ? this.formatDuration(new Date(job.completedAt) - new Date(job.startedAt))
      : '';

    return `
      <div class="job-card">
        <div class="job-icon ${job.status}">
          <i class="fas ${icon}"></i>
        </div>
        <div class="job-details">
          <div class="job-title">${this.escapeHtml(job.profession)} in ${this.escapeHtml(job.location)}</div>
          <div class="job-meta">
            ${sourceLabel} &bull; ${date} ${duration ? `&bull; ${duration}` : ''}
            <span class="badge badge-gray" style="margin-left:0.5rem">${job.status}</span>
          </div>
        </div>
        <div class="job-progress-mini">
          <div class="progress-label">
            <span>Progress</span>
            <span>${job.progress || 0}%</span>
          </div>
          <div class="progress-bar">
            <div class="progress-fill" style="width:${job.progress || 0}%"></div>
          </div>
        </div>
        <div class="job-stats-mini">
          <div class="job-stat">
            <div class="job-stat-value">${job.totalFound || 0}</div>
            <div class="job-stat-label">Found</div>
          </div>
          <div class="job-stat">
            <div class="job-stat-value">${job.totalSaved || 0}</div>
            <div class="job-stat-label">Saved</div>
          </div>
        </div>
      </div>`;
  }

  // ============================================================
  // Total Count Badge
  // ============================================================

  async loadTotalCount() {
    try {
      const response = await this.apiRequest('/api/leads?limit=1');
      if (!response.ok) return;

      const data = await response.json();
      const el = document.getElementById('totalLeadsCount');
      if (el) el.textContent = data.total || 0;
    } catch (err) {
      // silently fail
    }
  }

  // ============================================================
  // Utility Methods
  // ============================================================

  async apiRequest(url, options = {}) {
    const defaults = {
      headers: { 'Content-Type': 'application/json' },
    };
    return fetch(url, { ...defaults, ...options, headers: { ...defaults.headers, ...(options.headers || {}) } });
  }

  showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const icons = { success: 'fa-check-circle', error: 'fa-times-circle', info: 'fa-info-circle', warning: 'fa-exclamation-circle' };
    const icon = icons[type] || 'fa-info-circle';

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `<i class="fas ${icon}"></i><span>${this.escapeHtml(message)}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.3s';
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  }

  escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  capitalize(str) {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  formatSource(source) {
    const labels = {
      'google-maps': 'Google Maps',
      'yellow-pages': 'Yellow Pages',
      'yelp': 'Yelp',
      'bbb': 'BBB',
      'business-directory': 'Business Directory',
      'linkedin': 'LinkedIn',
      'direct': 'Direct',
      'all': 'All Sources',
    };
    return labels[source] || (source ? this.capitalize(source) : 'Unknown');
  }

  formatDuration(ms) {
    if (!ms || ms < 0) return '';
    const secs = Math.floor(ms / 1000);
    if (secs < 60) return `${secs}s`;
    const mins = Math.floor(secs / 60);
    const rem = secs % 60;
    return `${mins}m ${rem}s`;
  }
}

// Initialize app when DOM is ready
let app;
document.addEventListener('DOMContentLoaded', () => {
  app = new LeadScraperApp();
  window.app = app; // expose globally for inline onclick handlers
});
