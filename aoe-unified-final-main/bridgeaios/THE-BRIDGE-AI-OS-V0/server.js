const express = require('express');
const path = require('path');
const cors = require('cors');
const WebSocket = require('ws');
const http = require('http');

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3000;

// WebSocket server for live sync
const wss = new WebSocket.Server({ server });

// Live sync data store
let liveData = {
    system_status: {
        intelligence_engine: 'ACTIVE',
        economic_cycles: 'RUNNING',
        event_bus: 'OPERATIONAL',
        revenue_forecasting: 'OPTIMIZED'
    },
    economic_data: {
        intelligence_cycles: 1250,
        opportunities_created: 89,
        executions_completed: 67,
        revenue_forecasted: 2450000,
        last_updated: new Date().toISOString()
    },
    activity_feed: [],
    blog_posts: [],
    chat_messages: []
};

// Connected clients by page type
const clients = {
    dashboard: new Set(),
    docs: new Set(),
    blog: new Set(),
    contact: new Set(),
    home: new Set()
};

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// Simulate live data updates
setInterval(() => {
    // Update intelligence cycles
    liveData.economic_data.intelligence_cycles += Math.floor(Math.random() * 5);
    liveData.economic_data.opportunities_created += Math.floor(Math.random() * 2);
    liveData.economic_data.executions_completed += Math.floor(Math.random() * 3);
    liveData.economic_data.revenue_forecasted += Math.floor(Math.random() * 1000);
    liveData.economic_data.last_updated = new Date().toISOString();

    // Add random activity
    if (Math.random() < 0.3) { // 30% chance every 10 seconds
        const activities = [
            { type: 'intelligence', message: 'AI model optimization completed', timestamp: Date.now() },
            { type: 'economic', message: 'New opportunity detected in market analysis', timestamp: Date.now() },
            { type: 'system', message: 'Background task completed successfully', timestamp: Date.now() },
            { type: 'mcp', message: 'WordPress API synchronization updated', timestamp: Date.now() }
        ];

        const randomActivity = activities[Math.floor(Math.random() * activities.length)];
        liveData.activity_feed.unshift(randomActivity);

        // Keep only last 50 activities
        if (liveData.activity_feed.length > 50) {
            liveData.activity_feed = liveData.activity_feed.slice(0, 50);
        }

        // Broadcast to dashboard clients
        broadcastToPage('dashboard', 'activity_feed', liveData.activity_feed.slice(0, 10));
    }

    // Broadcast economic updates
    broadcastToPage('dashboard', 'economic_data', liveData.economic_data);

}, 10000); // Update every 10 seconds

// WebSocket connection handling
wss.on('connection', (ws, req) => {
    console.log('🌉 New WebSocket connection');

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message.toString());

            if (data.type === 'page_info') {
                // Register client by page type
                const pageType = data.payload.page || 'home';
                if (clients[pageType]) {
                    clients[pageType].add(ws);
                    console.log(`🌉 Client registered for ${pageType} page`);

                    // Send initial data based on page type
                    sendInitialData(ws, pageType);
                }
            } else if (data.type === 'chat_message') {
                // Handle chat messages
                handleChatMessage(data.payload);
            } else if (data.type === 'heartbeat') {
                // Handle heartbeat
                ws.send(JSON.stringify({ type: 'heartbeat_ack', timestamp: Date.now() }));
            }
        } catch (error) {
            console.error('🌉 WebSocket message error:', error);
        }
    });

    ws.on('close', () => {
        // Remove client from all page groups
        Object.keys(clients).forEach(pageType => {
            clients[pageType].delete(ws);
        });
        console.log('🌉 WebSocket connection closed');
    });

    ws.on('error', (error) => {
        console.error('🌉 WebSocket error:', error);
    });
});

// Broadcast to specific page type
function broadcastToPage(pageType, eventType, data) {
    if (clients[pageType]) {
        const message = JSON.stringify({
            type: eventType,
            payload: data,
            timestamp: Date.now()
        });

        clients[pageType].forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(message);
            }
        });
    }
}

// Send initial data when client connects
function sendInitialData(ws, pageType) {
    let initialData = {};

    switch (pageType) {
        case 'dashboard':
            initialData = {
                system_status: liveData.system_status,
                economic_data: liveData.economic_data,
                activity_feed: liveData.activity_feed.slice(0, 10)
            };
            break;
        case 'blog':
            initialData = {
                blog_posts: liveData.blog_posts,
                stats: { posts: 25, views: 15420, subscribers: 1205 }
            };
            break;
        default:
            initialData = { system_status: liveData.system_status };
    }

    ws.send(JSON.stringify({
        type: 'initial_data',
        payload: initialData,
        timestamp: Date.now()
    }));
}

// Handle chat messages
function handleChatMessage(message) {
    liveData.chat_messages.push({
        ...message,
        type: 'user'
    });

    // Broadcast to contact page clients
    broadcastToPage('contact', 'chat_message', message);

    // Simulate bot response (in real implementation, this would use AI)
    setTimeout(() => {
        const botResponse = {
            content: generateBotResponse(message.content),
            timestamp: Date.now(),
            type: 'bot'
        };

        liveData.chat_messages.push(botResponse);
        broadcastToPage('contact', 'chat_message', botResponse);
    }, 1000 + Math.random() * 2000);
}

function generateBotResponse(userMessage) {
    const responses = [
        "Thanks for your message! Our team will get back to you shortly.",
        "I understand you're looking for help with THE BRIDGE AI OS. Let me connect you with our technical team.",
        "That's a great question about our AI system. Our documentation has detailed information about this topic.",
        "I'd be happy to help you with that. Could you provide a bit more detail about what you're trying to accomplish?",
        "Our AI system is designed to handle complex tasks efficiently. Is there a specific feature you'd like to learn more about?",
        "Thank you for your interest in THE BRIDGE AI OS. Would you like me to schedule a demo for you?"
    ];

    const lowerMessage = userMessage.toLowerCase();

    if (lowerMessage.includes('pricing') || lowerMessage.includes('cost')) {
        return "We offer flexible pricing plans starting from $99/month. Would you like me to send you our pricing guide?";
    }

    if (lowerMessage.includes('demo') || lowerMessage.includes('trial')) {
        return "We'd love to show you THE BRIDGE AI OS in action! Our demos are typically 30 minutes. When would work best for you?";
    }

    if (lowerMessage.includes('support') || lowerMessage.includes('help')) {
        return "Our support team is here to help! You can reach us at support@thebridgeaios.com or check our documentation at docs.thebridgeaios.com";
    }

    return responses[Math.floor(Math.random() * responses.length)];
}

// API Routes
app.get('/api/health', (req, res) => {
    res.json({
        status: 'healthy',
        system: 'THE BRIDGE AI OS',
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

app.get('/api/system-status', (req, res) => {
    res.json(liveData.system_status);
});

app.get('/api/economic-data', (req, res) => {
    res.json(liveData.economic_data);
});

app.get('/api/activity-feed', (req, res) => {
    res.json(liveData.activity_feed.slice(0, 20));
});

// Blog API
app.get('/api/blog/posts', (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 9;
    const category = req.query.category || 'all';

    // Generate mock blog posts
    const mockPosts = generateMockPosts(page, limit, category);
    const stats = { posts: 125, views: 45678, subscribers: 2341 };

    res.json({
        posts: mockPosts,
        stats,
        featured: generateFeaturedPost(),
        pagination: {
            page,
            limit,
            total: 125,
            hasMore: page * limit < 125
        }
    });
});

app.post('/api/newsletter/subscribe', (req, res) => {
    const { email } = req.body;

    if (!email) {
        return res.status(400).json({ error: 'Email is required' });
    }

    // In a real implementation, save to database
    console.log(`📧 Newsletter subscription: ${email}`);

    // Broadcast to blog page clients
    broadcastToPage('blog', 'newsletter_subscription', { email, timestamp: Date.now() });

    res.json({ success: true, message: 'Successfully subscribed to newsletter' });
});

// Integration API
app.post('/api/integration/credentials', (req, res) => {
    const { email, type } = req.body;

    if (!email || !type) {
        return res.status(400).json({ error: 'Email and type are required' });
    }

    // Generate mock credentials
    const credentials = {
        email,
        type,
        apiKey: `bridge_${type}_${Math.random().toString(36).substr(2, 9)}`,
        endpoint: `https://api.thebridgeaios.com/v1/${type}`,
        documentation: `https://docs.thebridgeaios.com/${type}-integration`,
        created: new Date().toISOString()
    };

    // In a real implementation, save to database and send email
    console.log(`🔑 Generated ${type} credentials for ${email}`);

    res.json({
        success: true,
        credentials,
        message: 'Credentials generated successfully. Check your email for setup instructions.'
    });
});

// Community API
app.get('/api/community/posts', (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const filter = req.query.filter || 'all';

    // Generate mock community posts
    const posts = generateCommunityPosts(page, limit, filter);
    const stats = {
        members: 2847 + Math.floor(Math.random() * 50),
        discussions: 1203 + Math.floor(Math.random() * 20),
        projects: 156 + Math.floor(Math.random() * 5)
    };

    res.json({
        posts,
        stats,
        pagination: {
            page,
            limit,
            total: 1000,
            hasMore: page * limit < 1000
        }
    });
});

app.post('/api/community/posts', (req, res) => {
    const { title, content, category, author, timestamp } = req.body;

    if (!title || !content || !category) {
        return res.status(400).json({ error: 'Title, content, and category are required' });
    }

    const newPost = {
        id: Date.now(),
        title,
        content,
        category,
        author: author || 'Anonymous',
        timestamp: timestamp || Date.now(),
        likes: 0,
        comments: 0
    };

    // In a real implementation, save to database
    console.log(`📝 New community post: "${title}" by ${newPost.author}`);

    // Broadcast to all connected clients
    broadcastToPage('community', 'new_post', newPost);

    res.json({
        success: true,
        post: newPost,
        message: 'Post created successfully'
    });
});

// Contact API
app.post('/api/contact', (req, res) => {
    const { name, email, subject, message, priority, inquiryType } = req.body;

    if (!name || !email || !inquiryType || !message) {
        return res.status(400).json({ error: 'Required fields missing' });
    }

    // In a real implementation, save to database and send email
    console.log(`📬 Contact form submission from ${name} (${email}): ${inquiryType}`);

    // Generate ticket ID
    const ticketId = `TICKET-${Date.now().toString(36).toUpperCase()}`;

    // Send confirmation (mock)
    setTimeout(() => {
        console.log(`✅ Confirmation sent for ticket ${ticketId}`);
    }, 1000);

    res.json({
        success: true,
        message: 'Message sent successfully',
        ticket_id: ticketId
    });
});

app.get('/api/contact/info', (req, res) => {
    res.json({
        responseTime: 'We typically respond within 24 hours',
        supportHours: '24/7 for critical issues',
        channels: ['email', 'live_chat', 'documentation']
    });
});

// Server-Sent Events for fallback live sync
app.get('/api/events', (req, res) => {
    const page = req.query.page || 'home';

    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*'
    });

    // Send initial data
    res.write(`data: ${JSON.stringify({
        type: 'initial_data',
        payload: getInitialDataForPage(page),
        timestamp: Date.now()
    })}\n\n`);

    // Send periodic updates
    const interval = setInterval(() => {
        const update = getLiveUpdateForPage(page);
        if (update) {
            res.write(`data: ${JSON.stringify(update)}\n\n`);
        }
    }, 5000);

    // Handle client disconnect
    req.on('close', () => {
        clearInterval(interval);
    });
});

// Sync endpoint for HTTP fallback
app.post('/api/sync', (req, res) => {
    const { type, payload, page } = req.body;

    // Handle different sync types
    switch (type) {
        case 'chat_message':
            handleChatMessage(payload);
            break;
        case 'heartbeat':
            // Just acknowledge
            break;
        default:
            console.log(`📡 HTTP sync: ${type} from ${page}`);
    }

    res.json({ success: true });
});

// Serve pages
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/explore', (req, res) => {
    res.sendFile(path.join(__dirname, 'explore.html'));
});

app.get('/learn', (req, res) => {
    res.sendFile(path.join(__dirname, 'learn.html'));
});

app.get('/community', (req, res) => {
    res.sendFile(path.join(__dirname, 'community.html'));
});

app.get('/connect', (req, res) => {
    res.sendFile(path.join(__dirname, 'connect.html'));
});

// Legacy routes for backward compatibility
app.get('/dashboard', (req, res) => {
    res.redirect('/explore');
});

app.get('/docs', (req, res) => {
    res.redirect('/learn');
});

app.get('/blog', (req, res) => {
    res.redirect('/community');
});

app.get('/contact', (req, res) => {
    res.redirect('/connect');
});

// Generate mock blog posts
function generateMockPosts(page, limit, category) {
    const categories = ['research', 'updates', 'tutorials', 'insights'];
    const posts = [];

    for (let i = 0; i < limit; i++) {
        const postIndex = (page - 1) * limit + i;
        const postCategory = category === 'all' ? categories[postIndex % categories.length] : category;

        posts.push({
            id: postIndex + 1,
            title: generatePostTitle(postCategory, postIndex),
            excerpt: generatePostExcerpt(postCategory),
            author: generateAuthor(),
            date: new Date(Date.now() - postIndex * 86400000).toISOString(),
            category: postCategory,
            readTime: 3 + Math.floor(Math.random() * 8),
            image: `/images/post-${(postIndex % 6) + 1}.jpg`,
            slug: `post-${postIndex + 1}`,
            tags: generateTags(postCategory)
        });
    }

    return posts;
}

function generatePostTitle(category, index) {
    const titles = {
        research: [
            'Advancing Causal AI: New Breakthroughs in Economic Intelligence',
            'Machine Learning Optimization Techniques for Financial Forecasting',
            'Neural Networks in Market Analysis: A Comprehensive Study',
            'Predictive Analytics: Transforming Business Decision Making'
        ],
        updates: [
            'THE BRIDGE AI OS v2.1: Major Feature Release',
            'System Performance Improvements and Bug Fixes',
            'New Integration Capabilities Added',
            'Security Enhancements and Compliance Updates'
        ],
        tutorials: [
            'Getting Started with THE BRIDGE AI OS: Complete Guide',
            'Building Custom AI Models for Economic Analysis',
            'API Integration: Connecting External Systems',
            'Advanced Prompt Engineering Techniques'
        ],
        insights: [
            'The Future of AI in Business: Trends and Predictions',
            'Economic Intelligence: How AI is Changing Finance',
            'Machine Learning Ethics in Business Applications',
            'Scaling AI Systems: Challenges and Solutions'
        ]
    };

    return titles[category][index % titles[category].length];
}

function generatePostExcerpt(category) {
    const excerpts = {
        research: 'Recent studies show significant improvements in predictive accuracy using advanced causal inference techniques.',
        updates: 'This release includes major performance improvements and new features requested by our community.',
        tutorials: 'Follow this step-by-step guide to get started with THE BRIDGE AI OS and unlock its full potential.',
        insights: 'As AI continues to evolve, understanding its impact on business operations becomes increasingly critical.'
    };

    return excerpts[category];
}

function generateAuthor() {
    const authors = ['Dr. Sarah Chen', 'Prof. Michael Rodriguez', 'Dr. Emily Watson', 'Alex Thompson', 'Dr. James Liu'];
    return authors[Math.floor(Math.random() * authors.length)];
}

function generateTags(category) {
    const tagSets = {
        research: ['AI', 'Machine Learning', 'Research', 'Causal Inference'],
        updates: ['Release', 'Updates', 'Features', 'Improvements'],
        tutorials: ['Tutorial', 'Guide', 'Getting Started', 'API'],
        insights: ['Insights', 'Trends', 'Future', 'Business']
    };

    return tagSets[category];
}

function generateFeaturedPost() {
    return {
        title: 'The Evolution of Causal AI in Economic Systems',
        excerpt: 'Exploring how causal artificial intelligence is revolutionizing economic forecasting and decision-making processes across industries.',
        author: 'Dr. Sarah Chen',
        date: new Date().toISOString(),
        readTime: 8,
        category: 'research'
    };
}

function getInitialDataForPage(page) {
    switch (page) {
        case 'dashboard':
            return {
                system_status: liveData.system_status,
                economic_data: liveData.economic_data,
                activity_feed: liveData.activity_feed.slice(0, 10)
            };
        case 'blog':
            return {
                blog_posts: generateMockPosts(1, 6, 'all'),
                stats: { posts: 125, views: 45678, subscribers: 2341 },
                featured: generateFeaturedPost()
            };
        default:
            return { system_status: liveData.system_status };
    }
}

function getLiveUpdateForPage(page) {
    // Return random updates for demo purposes
    if (Math.random() < 0.2) { // 20% chance every 5 seconds
        switch (page) {
            case 'explore':
                return {
                    type: 'system_status',
                    payload: liveData.system_status,
                    timestamp: Date.now()
                };
            case 'community':
                return {
                    type: 'new_post',
                    payload: Math.random() < 0.1 ? generateCommunityPosts(1, 1, 'all')[0] : null,
                    timestamp: Date.now()
                };
        }
    }
    return null;
}

// Generate mock community posts
function generateCommunityPosts(page, limit, filter) {
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

// Error handling
app.use((err, req, res, next) => {
    console.error('Server error:', err);
    res.status(500).json({
        error: 'Internal server error',
        system: 'THE BRIDGE AI OS'
    });
});

// Start server
server.listen(PORT, () => {
    console.log(`
🌉 THE BRIDGE AI OS Server Started
═══════════════════════════════════════════
🚀 Server running on http://localhost:${PORT}
🧠 Intelligence Engine: ACTIVE
💰 Economic Cycles: READY
🔄 Event Bus: OPERATIONAL
🌐 WebSocket: ENABLED
📊 Live Sync: ACTIVE
🌉 Bridges: Home, Explore, Learn, Community, Connect
═══════════════════════════════════════════
📊 API Endpoints:
   • GET  /api/health - System health
   • GET  /api/system-status - Current status
   • GET  /api/economic-data - Live metrics
   • GET  /api/activity-feed - Recent activities
   • GET  /api/blog/posts - Blog posts
   • POST /api/contact - Contact form
   • POST /api/newsletter/subscribe - Newsletter
   • WS   /ws - WebSocket live sync
   • SSE  /api/events - Server-sent events
═══════════════════════════════════════════
    `);
});

module.exports = app;