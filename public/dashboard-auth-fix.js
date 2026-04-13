// CRM & Leads Authentication + Mobile Optimization Fix
// Automatically adds admin token and enhances mobile UX

(function() {
  // Set default admin token for dashboard
  if (!localStorage.getItem('admin_token')) {
    localStorage.setItem('admin_token', 'bridge-admin-2026-default');
  }

  // Override fetch to add admin token for protected endpoints
  const originalFetch = window.fetch;
  window.fetch = function(url, options = {}) {
    const headers = { ...options.headers };

    // Add admin token for protected dashboard endpoints
    if (typeof url === 'string' && (
      url.includes('/api/twin/env-keys') ||
      url.includes('/api/admin/') ||
      url.includes('/api/ubi/claim') ||
      url.includes('/api/crm/') ||
      url.includes('/api/esim/nurture')
    )) {
      const adminToken = localStorage.getItem('admin_token') || 'bridge-admin-2026-default';
      headers['x-admin-token'] = adminToken;
    }

    return originalFetch(url, { ...options, headers });
  };

  // Mobile UX Enhancements
  function enhanceMobileUX() {
    // Add touch-friendly improvements
    const style = document.createElement('style');
    style.textContent = `
      /* Mobile enhancements for CRM, Leads, and HITL */
      @media (max-width: 768px) {
        /* Better touch targets */
        button, .btn, .nav-btn, .cc-btn, .action-btns button, .btn-refresh {
          min-height: 44px !important;
          min-width: 44px !important;
          padding: 8px 12px !important;
        }

        /* Improved table scrolling on mobile */
        .leads-table, .contact-grid, .runs-table {
          overflow-x: auto;
          -webkit-overflow-scrolling: touch;
        }

        /* Better modal sizing */
        .modal {
          width: 95vw !important;
          max-width: none !important;
          margin: 10px !important;
        }

        /* Stack form rows on mobile */
        .form-row {
          grid-template-columns: 1fr !important;
          gap: 0.5rem !important;
        }

        /* Better spacing for mobile */
        .layout, .main {
          grid-template-columns: 1fr !important;
          height: calc(100vh - 120px) !important;
        }

        .detail-panel {
          display: none !important;
        }

        /* Mobile navigation improvements */
        nav, .header {
          flex-wrap: wrap !important;
          padding: 0.5rem 1rem !important;
        }

        .nav-links, .tabs {
          order: 2;
          width: 100%;
          margin-top: 0.5rem;
          justify-content: center;
        }

        .nav-brand, .header h1 {
          order: 1;
        }

        .nav-actions, .header-right {
          order: 3;
        }

        /* HITL specific mobile improvements */
        .stats-bar {
          flex-wrap: wrap !important;
          gap: 0.5rem !important;
        }

        .stat {
          min-width: 80px !important;
          flex: 1 !important;
        }

        .approval-card {
          padding: 12px !important;
        }

        .card-header {
          flex-direction: column !important;
          align-items: flex-start !important;
          gap: 4px !important;
        }

        .card-title {
          font-size: 13px !important;
        }

        .action-row {
          flex-direction: column !important;
          gap: 8px !important;
        }

        .btn-approve, .btn-reject, .btn-hold {
          width: 100% !important;
        }
      }

      @media (max-width: 480px) {
        /* Extra small screens */
        .stats-row, .stats-bar {
          padding: 0.5rem 1rem !important;
          gap: 0.5rem !important;
        }

        .stat-pill, .stat {
          min-width: 70px !important;
          padding: 0.4rem 0.6rem !important;
        }

        .toolbar {
          flex-direction: column !important;
          gap: 0.5rem !important;
          align-items: stretch !important;
        }

        .search-box, .admin-key {
          width: 100% !important;
          margin-bottom: 0.5rem !important;
        }

        .filter-sel {
          width: 100% !important;
        }

        .tabs {
          flex-wrap: wrap !important;
          gap: 2px !important;
        }

        .tab {
          flex: 1 !important;
          text-align: center !important;
          padding: 6px 8px !important;
          font-size: 12px !important;
        }
      }

      /* Improved touch feedback */
      button:active, .btn:active, .tab:active, .approval-card:active {
        transform: scale(0.98);
        transition: transform 0.1s ease;
      }

      /* Better focus states for accessibility */
      button:focus, .btn:focus, input:focus, select:focus, .tab:focus {
        outline: 2px solid var(--cyan);
        outline-offset: 2px;
      }

      /* Swipe gestures for mobile */
      .queue-list, .runs-table, .contacts-list {
        touch-action: pan-y;
      }
    `;
    document.head.appendChild(style);

    // Add swipe gestures for mobile
    let startX, startY;
    document.addEventListener('touchstart', (e) => {
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
    });

    document.addEventListener('touchend', (e) => {
      if (!startX || !startY) return;

      const endX = e.changedTouches[0].clientX;
      const endY = e.changedTouches[0].clientY;
      const diffX = startX - endX;
      const diffY = startY - endY;

      // Horizontal swipe detection
      if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > 50) {
        if (diffX > 0) {
          // Swipe left - next item
          const nextBtn = document.querySelector('.next-btn, [data-action="next"]');
          if (nextBtn) nextBtn.click();
        } else {
          // Swipe right - previous item
          const prevBtn = document.querySelector('.prev-btn, [data-action="prev"]');
          if (prevBtn) prevBtn.click();
        }
      }
    });
  }

  // Initialize enhancements when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', enhanceMobileUX);
  } else {
    enhanceMobileUX();
  }

  console.log('[CRM/LEADS] Authentication and mobile UX enhancements loaded');
})();
