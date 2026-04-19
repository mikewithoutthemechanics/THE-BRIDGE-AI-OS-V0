// THE BRIDGE AI OS - Blog JavaScript
// Dynamic blog posts with live sync

class Blog {
    constructor() {
        this.posts = [];
        this.currentPage = 1;
        this.postsPerPage = 9;
        this.currentCategory = 'all';
        this.loading = false;

        this.init();
    }

    init() {
        this.setupFilters();
        this.setupLoadMore();
        this.setupNewsletter();
        this.setupLiveSync();
        this.loadPosts();
    }

    setupFilters() {
        const filterButtons = document.querySelectorAll('.filter-btn');
        filterButtons.forEach(button => {
            button.addEventListener('click', () => {
                const category = button.dataset.category;

                // Update active filter
                filterButtons.forEach(btn => btn.classList.remove('active'));
                button.classList.add('active');

                this.currentCategory = category;
                this.currentPage = 1;
                this.loadPosts();
            });
        });
    }

    setupLoadMore() {
        const loadMoreBtn = document.getElementById('load-more-btn');
        if (loadMoreBtn) {
            loadMoreBtn.addEventListener('click', () => {
                this.loadMorePosts();
            });
        }
    }

    setupNewsletter() {
        const newsletterForm = document.getElementById('newsletter-submit');
        const emailInput = document.getElementById('newsletter-email');
        const messageElement = document.getElementById('newsletter-message');

        if (newsletterForm) {
            newsletterForm.addEventListener('click', () => {
                const email = emailInput.value.trim();

                if (!email) {
                    this.showNewsletterMessage('Please enter your email address', 'error');
                    return;
                }

                if (!this.isValidEmail(email)) {
                    this.showNewsletterMessage('Please enter a valid email address', 'error');
                    return;
                }

                // Send subscription request
                this.subscribeNewsletter(email);
            });
        }
    }

    setupLiveSync() {
        // Extend the global liveSync instance
        if (window.liveSync) {
            window.liveSync.updateBlogPosts = (posts) => this.handleBlogUpdate(posts);
        }
    }

    async loadPosts() {
        if (this.loading) return;

        this.loading = true;
        this.showLoading();

        try {
            const response = await fetch(`/api/blog/posts?page=${this.currentPage}&category=${this.currentCategory}&limit=${this.postsPerPage}`);
            const data = await response.json();

            if (this.currentPage === 1) {
                this.posts = data.posts || [];
            } else {
                this.posts = [...this.posts, ...(data.posts || [])];
            }

            this.renderPosts();
            this.updateStats(data.stats);

            if (this.currentPage === 1) {
                this.updateFeaturedPost(data.featured);
            }

        } catch (error) {
            console.error('Failed to load posts:', error);
            this.showError('Failed to load blog posts. Please try again.');
        } finally {
            this.loading = false;
            this.hideLoading();
        }
    }

    async loadMorePosts() {
        if (this.loading) return;

        this.currentPage++;
        await this.loadPosts();
    }

    renderPosts() {
        const postsGrid = document.getElementById('posts-grid');
        if (!postsGrid) return;

        // Clear existing posts (except loading/error states)
        const existingPosts = postsGrid.querySelectorAll('.blog-post');
        existingPosts.forEach(post => post.remove());

        this.posts.forEach((post, index) => {
            const postElement = this.createPostElement(post, index);
            postsGrid.appendChild(postElement);
        });

        // Update load more button
        const loadMoreBtn = document.getElementById('load-more-btn');
        if (loadMoreBtn) {
            loadMoreBtn.style.display = this.posts.length >= this.currentPage * this.postsPerPage ? 'block' : 'none';
        }
    }

    createPostElement(post, index) {
        const postElement = document.createElement('div');
        postElement.className = 'blog-post';
        postElement.innerHTML = `
            <div class="post-image">
                <img src="${post.image || '/images/post-placeholder.jpg'}" alt="${post.title}" loading="lazy">
                <div class="post-category">${post.category}</div>
            </div>
            <div class="post-content">
                <h3 class="post-title">${post.title}</h3>
                <p class="post-excerpt">${post.excerpt}</p>
                <div class="post-meta">
                    <span class="post-author">${post.author}</span>
                    <span class="post-date">${this.formatDate(post.date)}</span>
                    <span class="post-read-time">${post.readTime} min read</span>
                </div>
                <a href="/blog/${post.slug}" class="post-link">Read More</a>
            </div>
        `;

        // Add animation delay
        postElement.style.animationDelay = `${index * 0.1}s`;

        return postElement;
    }

    updateStats(stats) {
        const postsCount = document.getElementById('posts-count');
        const viewsCount = document.getElementById('views-count');
        const subscribersCount = document.getElementById('subscribers-count');

        if (postsCount && stats) {
            this.animateNumber(postsCount, stats.posts || 0);
        }
        if (viewsCount && stats) {
            this.animateNumber(viewsCount, stats.views || 0);
        }
        if (subscribersCount && stats) {
            this.animateNumber(subscribersCount, stats.subscribers || 0);
        }
    }

    updateFeaturedPost(featured) {
        if (!featured) return;

        const titleElement = document.getElementById('featured-title');
        const excerptElement = document.getElementById('featured-excerpt');
        const authorElement = document.getElementById('featured-author');
        const dateElement = document.getElementById('featured-date');
        const readTimeElement = document.getElementById('featured-read-time');

        if (titleElement) titleElement.textContent = featured.title;
        if (excerptElement) excerptElement.textContent = featured.excerpt;
        if (authorElement) authorElement.textContent = featured.author;
        if (dateElement) dateElement.textContent = this.formatDate(featured.date);
        if (readTimeElement) readTimeElement.textContent = `${featured.readTime} min read`;
    }

    animateNumber(element, target) {
        const start = parseInt(element.textContent) || 0;
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

    formatDate(dateString) {
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    }

    showLoading() {
        const postsGrid = document.getElementById('posts-grid');
        if (postsGrid) {
            const loadingElement = postsGrid.querySelector('.loading-posts');
            if (loadingElement) {
                loadingElement.style.display = 'block';
            }
        }
    }

    hideLoading() {
        const postsGrid = document.getElementById('posts-grid');
        if (postsGrid) {
            const loadingElement = postsGrid.querySelector('.loading-posts');
            if (loadingElement) {
                loadingElement.style.display = 'none';
            }
        }
    }

    showError(message) {
        const postsGrid = document.getElementById('posts-grid');
        if (postsGrid) {
            const errorElement = document.createElement('div');
            errorElement.className = 'error-message';
            errorElement.innerHTML = `
                <div class="error-icon">⚠️</div>
                <p>${message}</p>
                <button onclick="window.location.reload()" class="retry-btn">Retry</button>
            `;

            // Remove existing error messages
            const existingError = postsGrid.querySelector('.error-message');
            if (existingError) {
                existingError.remove();
            }

            postsGrid.appendChild(errorElement);
        }
    }

    async subscribeNewsletter(email) {
        try {
            const response = await fetch('/api/newsletter/subscribe', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email })
            });

            if (response.ok) {
                this.showNewsletterMessage('Successfully subscribed! Check your email for confirmation.', 'success');
                document.getElementById('newsletter-email').value = '';
            } else {
                throw new Error('Subscription failed');
            }
        } catch (error) {
            console.error('Newsletter subscription error:', error);
            this.showNewsletterMessage('Subscription failed. Please try again later.', 'error');
        }
    }

    showNewsletterMessage(message, type) {
        const messageElement = document.getElementById('newsletter-message');
        if (messageElement) {
            messageElement.textContent = message;
            messageElement.className = `newsletter-message ${type}`;
            messageElement.style.display = 'block';

            setTimeout(() => {
                messageElement.style.display = 'none';
            }, 5000);
        }
    }

    isValidEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }

    handleBlogUpdate(updates) {
        if (updates.newPosts) {
            // Add new posts to the beginning
            this.posts = [...updates.newPosts, ...this.posts];
            this.renderPosts();
        }

        if (updates.stats) {
            this.updateStats(updates.stats);
        }
    }
}

// Add blog-specific styles
const blogStyles = document.createElement('style');
blogStyles.textContent = `
.blog-post {
    background: var(--background-secondary);
    border-radius: 12px;
    overflow: hidden;
    box-shadow: 0 4px 15px var(--shadow-color);
    transition: all 0.3s ease;
    animation: fadeInUp 0.6s ease forwards;
    opacity: 0;
    transform: translateY(20px);
}

.blog-post:hover {
    transform: translateY(-5px);
    box-shadow: 0 8px 25px var(--shadow-color);
}

.post-image {
    position: relative;
    height: 200px;
    overflow: hidden;
}

.post-image img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    transition: transform 0.3s ease;
}

.blog-post:hover .post-image img {
    transform: scale(1.05);
}

.post-category {
    position: absolute;
    top: 1rem;
    left: 1rem;
    background: var(--primary-color);
    color: white;
    padding: 0.25rem 0.75rem;
    border-radius: 20px;
    font-size: 0.8rem;
    font-weight: 600;
    text-transform: uppercase;
}

.post-content {
    padding: 1.5rem;
}

.post-title {
    font-size: 1.25rem;
    font-weight: 600;
    margin-bottom: 0.75rem;
    color: var(--primary-color);
    line-height: 1.4;
}

.post-excerpt {
    color: var(--text-secondary);
    margin-bottom: 1rem;
    line-height: 1.6;
    display: -webkit-box;
    -webkit-line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
}

.post-meta {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1rem;
    font-size: 0.85rem;
    color: var(--text-muted);
}

.post-link {
    color: var(--accent-color);
    text-decoration: none;
    font-weight: 600;
    transition: color 0.3s ease;
}

.post-link:hover {
    color: var(--primary-color);
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

.filter-btn {
    background: transparent;
    border: 2px solid var(--border-color);
    color: var(--text-secondary);
    padding: 0.75rem 1.5rem;
    border-radius: 25px;
    cursor: pointer;
    font-weight: 500;
    transition: all 0.3s ease;
    margin: 0 0.5rem;
}

.filter-btn:hover,
.filter-btn.active {
    background: var(--primary-color);
    border-color: var(--primary-color);
    color: white;
}

.newsletter-message {
    margin-top: 1rem;
    padding: 1rem;
    border-radius: 8px;
    display: none;
}

.newsletter-message.success {
    background: rgba(16, 185, 129, 0.1);
    color: var(--success-color);
    border: 1px solid var(--success-color);
}

.newsletter-message.error {
    background: rgba(239, 68, 68, 0.1);
    color: var(--error-color);
    border: 1px solid var(--error-color);
}

@media (max-width: 768px) {
    .blog-filters {
        flex-direction: column;
        align-items: center;
    }

    .filter-btn {
        margin: 0.25rem 0;
    }

    .posts-grid {
        grid-template-columns: 1fr;
    }
}
`;
document.head.appendChild(blogStyles);

// Initialize blog when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.blog = new Blog();
});