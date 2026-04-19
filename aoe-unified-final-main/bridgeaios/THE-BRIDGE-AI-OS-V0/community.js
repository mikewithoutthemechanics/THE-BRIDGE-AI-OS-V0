// THE BRIDGE AI OS - Community Page JavaScript
// Dynamic community feed and social features

class CommunityPage {
    constructor() {
        this.posts = [];
        this.currentFilter = 'all';
        this.currentPage = 1;
        this.loading = false;

        this.init();
    }

    init() {
        this.setupFilters();
        this.setupPostCreation();
        this.setupNewsletter();
        this.setupLiveSync();
        this.loadPosts();
        this.startLiveUpdates();
    }

    setupFilters() {
        const filterButtons = document.querySelectorAll('.feed-filter');

        filterButtons.forEach(button => {
            button.addEventListener('click', () => {
                const filter = button.dataset.filter;

                // Update active filter
                filterButtons.forEach(btn => btn.classList.remove('active'));
                button.classList.add('active');

                this.currentFilter = filter;
                this.currentPage = 1;
                this.loadPosts();
            });
        });
    }

    setupPostCreation() {
        const createBtn = document.getElementById('create-post-btn');
        const joinBtn = document.getElementById('join-discussion-btn');

        if (createBtn) {
            createBtn.addEventListener('click', () => {
                this.showPostCreationModal();
            });
        }

        if (joinBtn) {
            joinBtn.addEventListener('click', () => {
                this.showJoinDiscussionModal();
            });
        }
    }

    setupNewsletter() {
        const newsletterBtn = document.getElementById('community-newsletter-btn');
        const emailInput = document.getElementById('community-email');
        const statusElement = document.getElementById('newsletter-status');

        if (newsletterBtn) {
            newsletterBtn.addEventListener('click', async () => {
                const email = emailInput.value.trim();

                if (!email) {
                    this.showNewsletterStatus('Please enter your email address', 'error');
                    return;
                }

                if (!this.isValidEmail(email)) {
                    this.showNewsletterStatus('Please enter a valid email address', 'error');
                    return;
                }

                this.showNewsletterStatus('Subscribing...', 'loading');

                try {
                    const response = await fetch('/api/newsletter/subscribe', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ email })
                    });

                    if (response.ok) {
                        this.showNewsletterStatus('Successfully subscribed! Welcome to our community.', 'success');
                        emailInput.value = '';
                    } else {
                        throw new Error('Subscription failed');
                    }
                } catch (error) {
                    console.error('Newsletter subscription error:', error);
                    this.showNewsletterStatus('Subscription failed. Please try again later.', 'error');
                }
            });
        }
    }

    setupLiveSync() {
        // Extend the global liveSync instance
        if (window.liveSync) {
            // Community page can receive live updates for new posts and stats
        }
    }

    async loadPosts() {
        if (this.loading) return;

        this.loading = true;
        this.showLoading();

        try {
            const response = await fetch(`/api/community/posts?page=${this.currentPage}&filter=${this.currentFilter}&limit=10`);
            const data = await response.json();

            if (this.currentPage === 1) {
                this.posts = data.posts || [];
            } else {
                this.posts = [...this.posts, ...(data.posts || [])];
            }

            this.renderPosts();
            this.updateStats(data.stats);

        } catch (error) {
            console.error('Failed to load posts:', error);
            this.showError('Failed to load community posts. Please try again.');
        } finally {
            this.loading = false;
            this.hideLoading();
        }
    }

    renderPosts() {
        const postsContainer = document.getElementById('community-posts');
        if (!postsContainer) return;

        // Clear existing posts (except loading/error states)
        const existingPosts = postsContainer.querySelectorAll('.community-post');
        existingPosts.forEach(post => post.remove());

        this.posts.forEach((post, index) => {
            const postElement = this.createPostElement(post, index);
            postsContainer.appendChild(postElement);
        });
    }

    createPostElement(post, index) {
        const postElement = document.createElement('div');
        postElement.className = 'community-post';
        postElement.innerHTML = `
            <div class="post-header">
                <div class="post-author">
                    <div class="author-avatar">${post.author.charAt(0).toUpperCase()}</div>
                    <div class="author-info">
                        <span class="author-name">${post.author}</span>
                        <span class="post-time">${this.formatTime(post.timestamp)}</span>
                    </div>
                </div>
                <div class="post-category category-${post.category}">${post.category}</div>
            </div>
            <div class="post-content">
                <h3 class="post-title">${post.title}</h3>
                <p class="post-excerpt">${post.content}</p>
                ${post.image ? `<img src="${post.image}" alt="Post image" class="post-image">` : ''}
            </div>
            <div class="post-actions">
                <button class="action-btn like-btn" onclick="this.classList.toggle('liked')">
                    👍 ${post.likes || 0}
                </button>
                <button class="action-btn comment-btn">
                    💬 ${post.comments || 0}
                </button>
                <button class="action-btn share-btn">
                    🔗 Share
                </button>
            </div>
        `;

        // Add animation delay
        postElement.style.animationDelay = `${index * 0.1}s`;

        return postElement;
    }

    updateStats(stats) {
        const membersEl = document.getElementById('community-members');
        const discussionsEl = document.getElementById('discussions-count');
        const projectsEl = document.getElementById('projects-shared');

        if (membersEl && stats) {
            this.animateNumber(membersEl, stats.members || 2847);
        }
        if (discussionsEl && stats) {
            this.animateNumber(discussionsEl, stats.discussions || 1203);
        }
        if (projectsEl && stats) {
            this.animateNumber(projectsEl, stats.projects || 156);
        }
    }

    animateNumber(element, target) {
        const start = parseInt(element.textContent.replace(/,/g, '')) || 0;
        const duration = 1000;
        const startTime = performance.now();

        const animate = (currentTime) => {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);

            const current = Math.floor(start + (target - start) * progress);
            element.textContent = current.toLocaleString();

            if (progress < 1) {
                requestAnimationFrame(animate);
            }
        };

        requestAnimationFrame(animate);
    }

    showLoading() {
        const postsContainer = document.getElementById('community-posts');
        if (postsContainer) {
            const loadingElement = postsContainer.querySelector('.loading-posts');
            if (loadingElement) {
                loadingElement.style.display = 'block';
            }
        }
    }

    hideLoading() {
        const postsContainer = document.getElementById('community-posts');
        if (postsContainer) {
            const loadingElement = postsContainer.querySelector('.loading-posts');
            if (loadingElement) {
                loadingElement.style.display = 'none';
            }
        }
    }

    showError(message) {
        const postsContainer = document.getElementById('community-posts');
        if (postsContainer) {
            const errorElement = document.createElement('div');
            errorElement.className = 'error-message';
            errorElement.innerHTML = `
                <div class="error-icon">⚠️</div>
                <p>${message}</p>
                <button onclick="window.location.reload()" class="retry-btn">Retry</button>
            `;

            // Remove existing error messages
            const existingError = postsContainer.querySelector('.error-message');
            if (existingError) {
                existingError.remove();
            }

            postsContainer.appendChild(errorElement);
        }
    }

    showPostCreationModal() {
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3>Share Your Work</h3>
                    <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">×</button>
                </div>
                <div class="modal-body">
                    <form id="post-form">
                        <div class="form-group">
                            <label for="post-title">Title</label>
                            <input type="text" id="post-title" required placeholder="What would you like to share?">
                        </div>
                        <div class="form-group">
                            <label for="post-category">Category</label>
                            <select id="post-category" required>
                                <option value="project">Project</option>
                                <option value="tutorial">Tutorial</option>
                                <option value="question">Question</option>
                                <option value="insight">Insight</option>
                                <option value="other">Other</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label for="post-content">Content</label>
                            <textarea id="post-content" rows="6" required placeholder="Share your thoughts, experiences, or ask for help..."></textarea>
                        </div>
                        <button type="submit" class="btn btn-primary">Share Post</button>
                    </form>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // Handle form submission
        const form = modal.querySelector('#post-form');
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            this.createPost(new FormData(form));
            modal.remove();
        });
    }

    showJoinDiscussionModal() {
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3>Join the Discussion</h3>
                    <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">×</button>
                </div>
                <div class="modal-body">
                    <div class="discussion-options">
                        <a href="https://discord.gg/bridge-ai-os" class="discussion-link discord" target="_blank">
                            <span class="discussion-icon">💬</span>
                            <div class="discussion-info">
                                <h4>Discord Community</h4>
                                <p>Real-time chat, voice channels, and community events</p>
                                <span class="discussion-meta">2,847 members online</span>
                            </div>
                        </a>
                        <a href="https://github.com/thebridgeaios/discussions" class="discussion-link github" target="_blank">
                            <span class="discussion-icon">📖</span>
                            <div class="discussion-info">
                                <h4>GitHub Discussions</h4>
                                <p>Technical discussions, bug reports, and feature requests</p>
                                <span class="discussion-meta">156 active discussions</span>
                            </div>
                        </a>
                        <a href="https://forum.thebridgeaios.com" class="discussion-link forum" target="_blank">
                            <span class="discussion-icon">🏛️</span>
                            <div class="discussion-info">
                                <h4>Community Forum</h4>
                                <p>In-depth discussions and knowledge sharing</p>
                                <span class="discussion-meta">45 topics today</span>
                            </div>
                        </a>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
    }

    async createPost(formData) {
        const postData = {
            title: formData.get('post-title'),
            content: formData.get('post-content'),
            category: formData.get('post-category'),
            author: 'Community Member', // In real app, get from auth
            timestamp: Date.now()
        };

        try {
            const response = await fetch('/api/community/posts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(postData)
            });

            if (response.ok) {
                // Add to local posts and re-render
                this.posts.unshift({ ...postData, likes: 0, comments: 0 });
                this.renderPosts();

                // Send to live sync
                if (window.liveSync) {
                    window.liveSync.sendMessage('new_post', postData);
                }
            }
        } catch (error) {
            console.error('Failed to create post:', error);
        }
    }

    showNewsletterStatus(message, type) {
        const statusElement = document.getElementById('newsletter-status');
        if (statusElement) {
            statusElement.textContent = message;
            statusElement.className = `newsletter-status ${type}`;
            statusElement.style.display = 'block';

            setTimeout(() => {
                statusElement.style.display = 'none';
            }, 5000);
        }
    }

    isValidEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }

    formatTime(timestamp) {
        const now = Date.now();
        const diff = now - timestamp;
        const minutes = Math.floor(diff / 60000);
        const hours = Math.floor(diff / 3600000);
        const days = Math.floor(diff / 86400000);

        if (minutes < 1) return 'Just now';
        if (minutes < 60) return `${minutes}m ago`;
        if (hours < 24) return `${hours}h ago`;
        return `${days}d ago`;
    }

    startLiveUpdates() {
        // Update stats every 30 seconds
        setInterval(() => {
            this.updateLiveStats();
        }, 30000);
    }

    updateLiveStats() {
        // Simulate live updates to community stats
        const membersEl = document.getElementById('community-members');
        const discussionsEl = document.getElementById('discussions-count');

        if (membersEl && Math.random() < 0.3) { // 30% chance
            const current = parseInt(membersEl.textContent.replace(/,/g, ''));
            const change = Math.floor(Math.random() * 3) - 1; // -1 to +1
            const newValue = Math.max(0, current + change);
            this.animateNumber(membersEl, newValue);
        }

        if (discussionsEl && Math.random() < 0.2) { // 20% chance
            const current = parseInt(discussionsEl.textContent.replace(/,/g, ''));
            const change = Math.floor(Math.random() * 5) - 2; // -2 to +2
            const newValue = Math.max(0, current + change);
            this.animateNumber(discussionsEl, newValue);
        }
    }
}

// Generate mock community posts
function generateMockPosts(page, limit, filter) {
    const categories = ['updates', 'projects', 'discussions', 'tutorials', 'insights'];
    const authors = ['Dr. Sarah Chen', 'Alex Rodriguez', 'Maria Gonzalez', 'David Kim', 'Emma Watson', 'James Liu'];
    const titles = {
        updates: ['New AI Model Released', 'System Performance Improvements', 'Security Updates Applied', 'API Version 2.1 Available'],
        projects: ['Built an Economic Forecasting Tool', 'Created Causal Analysis Dashboard', 'Developed AI Trading Bot', 'Launched Community Analytics Platform'],
        discussions: ['Best Practices for Causal Inference', 'Scaling AI Systems Discussion', 'Economic Data Sources', 'Integration Challenges & Solutions'],
        tutorials: ['Getting Started with MCP Protocol', 'Building Economic Models', 'API Authentication Guide', 'Deploying to Production'],
        insights: ['Future of AI Economics', 'Causal AI vs Traditional ML', 'Market Trends Analysis', 'Industry Applications']
    };

    const posts = [];

    for (let i = 0; i < limit; i++) {
        const category = filter === 'all' ? categories[Math.floor(Math.random() * categories.length)] : filter;
        const postTitles = titles[category] || titles.updates;
        const titleIndex = Math.floor(Math.random() * postTitles.length);

        posts.push({
            id: (page - 1) * limit + i + 1,
            title: postTitles[titleIndex],
            content: `This is an exciting ${category} post about ${postTitles[titleIndex].toLowerCase()}. The community is growing and sharing amazing insights about causal AI economics.`,
            author: authors[Math.floor(Math.random() * authors.length)],
            category,
            timestamp: Date.now() - Math.random() * 86400000 * 7, // Random time in last week
            likes: Math.floor(Math.random() * 50),
            comments: Math.floor(Math.random() * 20),
            image: Math.random() < 0.3 ? `/images/post-${Math.floor(Math.random() * 6) + 1}.jpg` : null
        });
    }

    return posts;
}

// Add community-specific styles
const communityStyles = document.createElement('style');
communityStyles.textContent = `
.community-header {
    background: linear-gradient(135deg, var(--background-primary), var(--background-secondary));
    padding: 4rem 0 2rem;
    text-align: center;
}

.community-header h1 {
    font-size: 3rem;
    margin-bottom: 1rem;
    background: linear-gradient(135deg, var(--primary-color), var(--accent-color));
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
}

.community-subtitle {
    font-size: 1.2rem;
    color: var(--text-secondary);
    max-width: 700px;
    margin: 0 auto;
}

.community-stats {
    padding: 3rem 0;
    background: var(--background-primary);
}

.stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
    gap: 2rem;
}

.stat-card {
    background: var(--background-secondary);
    border: 1px solid var(--border-color);
    border-radius: 12px;
    padding: 2rem;
    text-align: center;
    transition: all 0.3s ease;
}

.stat-card:hover {
    border-color: var(--primary-color);
    box-shadow: 0 8px 25px var(--shadow-color);
}

.stat-number {
    font-size: 2.5rem;
    font-weight: 700;
    color: var(--primary-color);
    margin-bottom: 0.5rem;
}

.stat-label {
    color: var(--text-secondary);
    font-size: 1rem;
    margin-bottom: 0.5rem;
}

.stat-trend {
    color: var(--accent-color);
    font-size: 0.9rem;
    font-weight: 600;
}

.community-feed {
    padding: 3rem 0;
    background: var(--background-secondary);
}

.feed-filters {
    display: flex;
    justify-content: center;
    gap: 1rem;
    margin-bottom: 3rem;
    flex-wrap: wrap;
}

.feed-filter {
    background: transparent;
    border: 2px solid var(--border-color);
    color: var(--text-secondary);
    padding: 0.75rem 1.5rem;
    border-radius: 25px;
    cursor: pointer;
    font-weight: 500;
    transition: all 0.3s ease;
}

.feed-filter:hover,
.feed-filter.active {
    background: var(--primary-color);
    border-color: var(--primary-color);
    color: white;
}

.posts-feed {
    max-width: 800px;
    margin: 0 auto;
}

.community-post {
    background: var(--background-primary);
    border: 1px solid var(--border-color);
    border-radius: 12px;
    margin-bottom: 1.5rem;
    overflow: hidden;
    transition: all 0.3s ease;
    animation: fadeInUp 0.6s ease forwards;
    opacity: 0;
    transform: translateY(20px);
}

.community-post:hover {
    border-color: var(--primary-color);
    box-shadow: 0 4px 15px var(--shadow-color);
}

.post-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1rem 1.5rem;
    border-bottom: 1px solid var(--border-color);
}

.post-author {
    display: flex;
    align-items: center;
    gap: 1rem;
}

.author-avatar {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    background: var(--primary-color);
    color: white;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 600;
    font-size: 1.1rem;
}

.author-info {
    display: flex;
    flex-direction: column;
}

.author-name {
    font-weight: 600;
    color: var(--text-primary);
}

.post-time {
    font-size: 0.8rem;
    color: var(--text-muted);
}

.post-category {
    padding: 0.25rem 0.75rem;
    border-radius: 12px;
    font-size: 0.8rem;
    font-weight: 600;
    text-transform: uppercase;
}

.category-updates { background: var(--success-color); color: white; }
.category-projects { background: var(--primary-color); color: white; }
.category-discussions { background: var(--warning-color); color: white; }
.category-tutorials { background: var(--accent-color); color: white; }
.category-insights { background: var(--secondary-color); color: white; }

.post-content {
    padding: 1.5rem;
}

.post-title {
    font-size: 1.25rem;
    font-weight: 600;
    color: var(--primary-color);
    margin-bottom: 1rem;
}

.post-excerpt {
    color: var(--text-secondary);
    line-height: 1.6;
    margin-bottom: 1rem;
}

.post-image {
    width: 100%;
    height: 200px;
    object-fit: cover;
    border-radius: 8px;
}

.post-actions {
    display: flex;
    gap: 1rem;
    padding: 1rem 1.5rem;
    border-top: 1px solid var(--border-color);
}

.action-btn {
    background: transparent;
    border: none;
    color: var(--text-secondary);
    cursor: pointer;
    font-size: 0.9rem;
    padding: 0.5rem;
    border-radius: 4px;
    transition: all 0.3s ease;
}

.action-btn:hover {
    background: var(--background-tertiary);
    color: var(--text-primary);
}

.action-btn.liked {
    color: var(--error-color);
}

.feed-actions {
    text-align: center;
    margin-top: 2rem;
}

.showcase-section {
    padding: 4rem 0;
    background: var(--background-primary);
}

.showcase-section h2 {
    text-align: center;
    margin-bottom: 3rem;
    color: var(--primary-color);
}

.showcase-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(350px, 1fr));
    gap: 2rem;
}

.project-card {
    background: var(--background-secondary);
    border: 1px solid var(--border-color);
    border-radius: 12px;
    overflow: hidden;
    transition: all 0.3s ease;
}

.project-card:hover {
    transform: translateY(-5px);
    box-shadow: 0 8px 25px var(--shadow-color);
    border-color: var(--primary-color);
}

.project-image {
    height: 150px;
    background: var(--background-tertiary);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 3rem;
}

.project-content {
    padding: 1.5rem;
}

.project-content h3 {
    color: var(--primary-color);
    margin-bottom: 1rem;
    font-size: 1.25rem;
}

.project-content p {
    color: var(--text-secondary);
    margin-bottom: 1rem;
    line-height: 1.6;
}

.project-meta {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1rem;
    font-size: 0.9rem;
    color: var(--text-muted);
}

.project-link {
    color: var(--accent-color);
    text-decoration: none;
    font-weight: 600;
    transition: color 0.3s ease;
}

.project-link:hover {
    color: var(--primary-color);
}

.events-section {
    padding: 4rem 0;
    background: var(--background-secondary);
}

.events-section h2 {
    text-align: center;
    margin-bottom: 3rem;
    color: var(--primary-color);
}

.events-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(350px, 1fr));
    gap: 2rem;
}

.event-card {
    background: var(--background-primary);
    border: 1px solid var(--border-color);
    border-radius: 12px;
    overflow: hidden;
    transition: all 0.3s ease;
    position: relative;
}

.event-card:hover {
    border-color: var(--primary-color);
    box-shadow: 0 8px 25px var(--shadow-color);
}

.event-card.featured {
    border-color: var(--accent-color);
    box-shadow: 0 4px 15px rgba(6, 182, 212, 0.2);
}

.event-badge {
    position: absolute;
    top: 1rem;
    right: 1rem;
    background: var(--accent-color);
    color: white;
    padding: 0.25rem 0.75rem;
    border-radius: 12px;
    font-size: 0.8rem;
    font-weight: 600;
}

.event-date {
    background: var(--background-tertiary);
    padding: 2rem;
    text-align: center;
}

.event-month {
    font-size: 0.9rem;
    font-weight: 600;
    color: var(--primary-color);
    text-transform: uppercase;
    margin-bottom: 0.5rem;
}

.event-day {
    font-size: 2rem;
    font-weight: 700;
    color: var(--text-primary);
}

.event-content {
    padding: 1.5rem;
}

.event-content h3 {
    color: var(--primary-color);
    margin-bottom: 1rem;
    font-size: 1.25rem;
}

.event-content p {
    color: var(--text-secondary);
    margin-bottom: 1rem;
    line-height: 1.6;
}

.event-details {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    margin-bottom: 1.5rem;
    font-size: 0.9rem;
    color: var(--text-muted);
}

.event-btn {
    background: var(--primary-color);
    color: white;
    border: none;
    padding: 0.75rem 1.5rem;
    border-radius: 8px;
    cursor: pointer;
    font-weight: 600;
    text-decoration: none;
    display: inline-block;
    transition: background 0.3s ease;
}

.event-btn:hover {
    background: var(--secondary-color);
}

.guidelines-section {
    padding: 4rem 0;
    background: var(--background-primary);
}

.guidelines-section h2 {
    text-align: center;
    margin-bottom: 3rem;
    color: var(--primary-color);
}

.guidelines-content {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
    gap: 2rem;
}

.guideline-principle {
    text-align: center;
    padding: 2rem;
    background: var(--background-secondary);
    border-radius: 12px;
    border: 1px solid var(--border-color);
    transition: all 0.3s ease;
}

.guideline-principle:hover {
    border-color: var(--primary-color);
    box-shadow: 0 8px 25px var(--shadow-color);
}

.principle-icon {
    font-size: 3rem;
    margin-bottom: 1rem;
}

.guideline-principle h3 {
    color: var(--primary-color);
    margin-bottom: 1rem;
}

.guideline-principle p {
    color: var(--text-secondary);
    line-height: 1.6;
}

.social-section {
    padding: 4rem 0;
    background: var(--background-secondary);
}

.social-content {
    max-width: 800px;
    margin: 0 auto;
    text-align: center;
}

.social-content h2 {
    color: var(--primary-color);
    margin-bottom: 1rem;
}

.social-content p {
    color: var(--text-secondary);
    margin-bottom: 2rem;
    font-size: 1.1rem;
}

.social-links {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
    gap: 1rem;
    margin-bottom: 3rem;
}

.social-link {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 1.5rem;
    background: var(--background-primary);
    border: 1px solid var(--border-color);
    border-radius: 12px;
    text-decoration: none;
    transition: all 0.3s ease;
}

.social-link:hover {
    border-color: var(--primary-color);
    box-shadow: 0 4px 15px var(--shadow-color);
}

.social-icon {
    font-size: 2rem;
}

.social-text {
    font-weight: 600;
    color: var(--text-primary);
}

.social-count {
    color: var(--text-secondary);
    font-size: 0.9rem;
}

.newsletter-signup {
    background: var(--background-primary);
    border: 1px solid var(--border-color);
    border-radius: 12px;
    padding: 2rem;
    margin-top: 2rem;
}

.newsletter-signup h3 {
    color: var(--primary-color);
    margin-bottom: 1rem;
}

.newsletter-signup p {
    color: var(--text-secondary);
    margin-bottom: 1.5rem;
}

.newsletter-input {
    width: 100%;
    padding: 1rem;
    border: 1px solid var(--border-color);
    border-radius: 8px;
    background: var(--background-secondary);
    color: var(--text-primary);
    font-size: 1rem;
    margin-bottom: 1rem;
}

.newsletter-input:focus {
    outline: none;
    border-color: var(--primary-color);
}

.newsletter-status {
    font-size: 0.9rem;
    margin-top: 1rem;
    display: none;
}

.newsletter-status.success {
    color: var(--success-color);
}

.newsletter-status.error {
    color: var(--error-color);
}

@keyframes fadeInUp {
    to {
        opacity: 1;
        transform: translateY(0);
    }
}

.loading-posts {
    text-align: center;
    padding: 3rem;
    color: var(--text-secondary);
}

.loading-spinner {
    width: 40px;
    height: 40px;
    border: 4px solid var(--border-color);
    border-top: 4px solid var(--primary-color);
    border-radius: 50%;
    animation: spin 1s linear infinite;
    margin: 0 auto 1rem;
}

@keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
}

.error-message {
    text-align: center;
    padding: 3rem;
    color: var(--error-color);
}

.error-icon {
    font-size: 3rem;
    margin-bottom: 1rem;
}

.retry-btn {
    background: var(--primary-color);
    color: white;
    border: none;
    padding: 0.75rem 1.5rem;
    border-radius: 8px;
    cursor: pointer;
    font-weight: 600;
    margin-top: 1rem;
    transition: background 0.3s ease;
}

.retry-btn:hover {
    background: var(--secondary-color);
}

/* Modal Styles */
.modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.7);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
}

.modal-content {
    background: var(--background-primary);
    border: 1px solid var(--border-color);
    border-radius: 12px;
    width: 90%;
    max-width: 500px;
    max-height: 90vh;
    overflow-y: auto;
}

.modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1.5rem;
    border-bottom: 1px solid var(--border-color);
}

.modal-header h3 {
    color: var(--primary-color);
    margin: 0;
}

.modal-close {
    background: none;
    border: none;
    font-size: 1.5rem;
    cursor: pointer;
    color: var(--text-secondary);
    padding: 0.25rem;
}

.modal-body {
    padding: 1.5rem;
}

.discussion-options {
    display: flex;
    flex-direction: column;
    gap: 1rem;
}

.discussion-link {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 1.5rem;
    background: var(--background-secondary);
    border: 1px solid var(--border-color);
    border-radius: 8px;
    text-decoration: none;
    transition: all 0.3s ease;
}

.discussion-link:hover {
    border-color: var(--primary-color);
    box-shadow: 0 4px 15px var(--shadow-color);
}

.discussion-info h4 {
    color: var(--primary-color);
    margin-bottom: 0.5rem;
}

.discussion-info p {
    color: var(--text-secondary);
    margin-bottom: 0.25rem;
    font-size: 0.9rem;
}

.discussion-meta {
    color: var(--accent-color);
    font-size: 0.8rem;
    font-weight: 600;
}

@media (max-width: 768px) {
    .community-header h1 {
        font-size: 2rem;
    }

    .stats-grid {
        grid-template-columns: 1fr;
    }

    .feed-filters {
        flex-direction: column;
        align-items: center;
    }

    .showcase-grid {
        grid-template-columns: 1fr;
    }

    .events-grid {
        grid-template-columns: 1fr;
    }

    .guidelines-content {
        grid-template-columns: 1fr;
    }

    .social-links {
        grid-template-columns: 1fr;
    }

    .modal-content {
        width: 95%;
        margin: 1rem;
    }
}
`;
document.head.appendChild(communityStyles);

// Initialize community page when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.communityPage = new CommunityPage();
});