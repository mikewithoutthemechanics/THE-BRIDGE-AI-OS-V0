/**
 * NeuroLink Level 3: Intelligence Graph
 * Multi-user behavioral intelligence and cross-user pattern discovery
 * Maps user relationships via shared cognitive patterns and behavioral transitions
 */

class IntelligenceGraph {
  constructor() {
    this.users = new Map(); // userId -> { clone, patterns, segments }
    this.patterns = new Map(); // patternId -> { users: Set, value, frequency, action }
    this.userSimilarity = new Map(); // "user1:user2" -> score (0-1)
    this.segments = new Map(); // segmentId -> { users: Set, profile, commonPatterns }
    this.actionRecommendations = new Map(); // userId -> { action, reason, confidence }
    this.patternIndex = new Map(); // intent -> { patterns: [], commonNextIntents: {} }
  }

  /**
   * Register a user clone into the intelligence graph
   * Called when a UserClone is created or loaded
   */
  registerUser(userId, userClone) {
    this.users.set(userId, {
      clone: userClone,
      patterns: Array.from(userClone.patterns.entries()),
      segments: new Set(),
      lastUpdate: Date.now()
    });

    // Rebuild graph relationships
    this._rebuildSimilarity(userId);
  }

  /**
   * Extract patterns from a user and identify cross-user insights
   */
  extractPatterns(userId) {
    const user = this.users.get(userId);
    if (!user) return null;

    const clone = user.clone;
    const patterns = [];

    // Pattern 1: Dominant intent + state combo
    const summary = clone.getSummary();
    if (summary.mostCommonIntent && summary.averageFocus) {
      const dominantPattern = {
        type: 'dominant_intent_state',
        intent: summary.mostCommonIntent,
        focus: summary.averageFocus,
        frequency: summary.totalObservations,
        value: this._calculatePatternValue(summary)
      };
      patterns.push(dominantPattern);
    }

    // Pattern 2: Transition patterns (intent chains)
    for (const [intent, intentPattern] of clone.patterns) {
      if (intentPattern.transitions.size > 0) {
        const topTransitions = Array.from(intentPattern.transitions.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 2);

        topTransitions.forEach(([nextIntent, count]) => {
          const transitionPattern = {
            type: 'transition_chain',
            from: intent,
            to: nextIntent,
            frequency: count,
            value: count * 0.5 // Transitions are moderately valuable
          };
          patterns.push(transitionPattern);
        });
      }
    }

    // Pattern 3: State clustering (similar state behaviors)
    const statePatterns = this._extractStatePatterns(clone);
    patterns.push(...statePatterns);

    return {
      userId,
      patternCount: patterns.length,
      patterns,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Extract state clustering patterns
   */
  _extractStatePatterns(clone) {
    const patterns = [];
    for (const [stateKey, statePattern] of clone.statePatterns) {
      if (statePattern.frequency >= 3) {
        const dominantAction = Array.from(statePattern.actions.entries())
          .sort((a, b) => b[1] - a[1])[0];

        patterns.push({
          type: 'state_cluster',
          stateKey,
          frequency: statePattern.frequency,
          dominantIntent: dominantAction ? dominantAction[0] : 'general',
          value: statePattern.frequency * 0.3
        });
      }
    }
    return patterns;
  }

  /**
   * Calculate pattern value based on consistency and impact
   */
  _calculatePatternValue(summary) {
    const observationScore = Math.min(summary.totalObservations / 100, 1); // 0-1
    const focusScore = parseFloat(summary.averageFocus) / 100; // 0-1
    const uniquenessScore = Math.min(summary.uniqueIntents / 5, 1); // Normalize by 5

    return (observationScore * 0.5 + focusScore * 0.3 + uniquenessScore * 0.2);
  }

  /**
   * Find users with similar behavioral patterns
   */
  _rebuildSimilarity(userId) {
    const userPatterns = this.extractPatterns(userId);
    if (!userPatterns) return;

    for (const [otherUserId, otherUser] of this.users) {
      if (otherUserId === userId) continue;

      const otherPatterns = this.extractPatterns(otherUserId);
      const similarity = this._calculateSimilarity(userPatterns, otherPatterns);

      if (similarity > 0.3) {
        const key = [userId, otherUserId].sort().join(':');
        this.userSimilarity.set(key, similarity);

        // If highly similar, they should be in the same segment
        if (similarity > 0.6) {
          this._assignToSegment(userId, otherUserId, similarity);
        }
      }
    }
  }

  /**
   * Calculate similarity between two users' patterns
   */
  _calculateSimilarity(patterns1, patterns2) {
    if (!patterns1 || !patterns2) return 0;

    const p1 = patterns1.patterns || [];
    const p2 = patterns2.patterns || [];

    let matches = 0;
    let totalComparisons = 0;

    // Compare intent patterns
    for (const pattern1 of p1.filter(p => p.type === 'dominant_intent_state')) {
      for (const pattern2 of p2.filter(p => p.type === 'dominant_intent_state')) {
        totalComparisons++;
        if (pattern1.intent === pattern2.intent && Math.abs(pattern1.focus - pattern2.focus) < 0.2) {
          matches += 1;
        }
      }
    }

    // Compare transitions
    for (const pattern1 of p1.filter(p => p.type === 'transition_chain')) {
      for (const pattern2 of p2.filter(p => p.type === 'transition_chain')) {
        totalComparisons++;
        if (pattern1.from === pattern2.from && pattern1.to === pattern2.to) {
          matches += 1;
        }
      }
    }

    return totalComparisons > 0 ? matches / totalComparisons : 0;
  }

  /**
   * Assign users to behavioral segments
   */
  _assignToSegment(userId1, userId2, similarity) {
    const segmentId = [userId1, userId2].sort().join('_segment');

    if (!this.segments.has(segmentId)) {
      this.segments.set(segmentId, {
        users: new Set([userId1, userId2]),
        profile: null,
        commonPatterns: [],
        similarity
      });
    } else {
      const segment = this.segments.get(segmentId);
      segment.users.add(userId1);
      segment.users.add(userId2);
    }

    // Update user's segment membership
    const user1 = this.users.get(userId1);
    const user2 = this.users.get(userId2);
    if (user1) user1.segments.add(segmentId);
    if (user2) user2.segments.add(segmentId);
  }

  /**
   * Generate cross-user recommendations (highly valuable patterns that work across users)
   */
  generateCrossUserRecommendations() {
    const recommendations = new Map(); // userId -> { action, reason, value }

    // Find patterns that appear in multiple users
    const patternFrequency = new Map();
    for (const [userId, user] of this.users) {
      const patterns = this.extractPatterns(userId);
      patterns.patterns.forEach(p => {
        const key = p.type + ':' + p.intent;
        if (!patternFrequency.has(key)) {
          patternFrequency.set(key, { count: 0, users: new Set(), pattern: p });
        }
        const freq = patternFrequency.get(key);
        freq.count++;
        freq.users.add(userId);
      });
    }

    // High-value cross-user patterns are those that appear in 3+ users
    const highValuePatterns = Array.from(patternFrequency.values())
      .filter(f => f.count >= 3)
      .sort((a, b) => b.pattern.value - a.pattern.value);

    // Generate recommendations for each user based on cross-user insights
    for (const [userId, user] of this.users) {
      for (const highValuePattern of highValuePatterns) {
        if (!highValuePattern.users.has(userId)) {
          // This pattern is common in other users but NOT in this user - recommend it
          const recommendation = {
            action: 'ADOPT_PATTERN',
            pattern: highValuePattern.pattern,
            reason: `${highValuePattern.count} similar users show this pattern is high-value`,
            value: highValuePattern.pattern.value,
            matchingUsers: highValuePattern.count
          };

          if (!recommendations.has(userId)) {
            recommendations.set(userId, []);
          }
          recommendations.get(userId).push(recommendation);
        }
      }
    }

    // For each user, keep top 3 recommendations by value
    for (const [userId, recs] of recommendations) {
      const sorted = recs.sort((a, b) => b.value - a.value).slice(0, 3);
      this.actionRecommendations.set(userId, sorted);
    }

    return recommendations;
  }

  /**
   * Get segment profile (average metrics for a behavioral cohort)
   */
  getSegmentProfile(segmentId) {
    const segment = this.segments.get(segmentId);
    if (!segment) return null;

    const users = Array.from(segment.users).map(uid => this.users.get(uid)).filter(Boolean);
    if (users.length === 0) return null;

    const avgFocus = users.reduce((s, u) => s + parseFloat(u.clone.getSummary().averageFocus || 0), 0) / users.length;
    const intents = new Set();
    users.forEach(u => {
      u.clone.patterns.forEach((_, intent) => intents.add(intent));
    });

    return {
      segmentId,
      userCount: users.length,
      averageFocus: avgFocus,
      intents: Array.from(intents),
      similarity: segment.similarity,
      commonPatterns: segment.commonPatterns
    };
  }

  /**
   * Get intelligence summary for graph state
   */
  getSummary() {
    const userCount = this.users.size;
    const segmentCount = this.segments.size;
    const similarityPairs = this.userSimilarity.size;

    return {
      userCount,
      segmentCount,
      similarityPairs,
      patterns: this.patterns.size,
      recommendations: this.actionRecommendations.size,
      avgSimilarity: similarityPairs > 0
        ? Array.from(this.userSimilarity.values()).reduce((a, b) => a + b) / similarityPairs
        : 0
    };
  }

  /**
   * Serialize for persistence
   */
  toJSON() {
    return {
      users: Array.from(this.users.entries()).map(([uid, user]) => ({
        userId: uid,
        clone: user.clone.toJSON()
      })),
      segments: Array.from(this.segments.entries()).map(([sid, seg]) => ({
        segmentId: sid,
        users: Array.from(seg.users),
        similarity: seg.similarity
      })),
      recommendations: Array.from(this.actionRecommendations.entries())
    };
  }

  /**
   * Deserialize from storage
   */
  static fromJSON(data, { UserClone }) {
    const graph = new IntelligenceGraph();

    // Restore users
    data.users.forEach(({ userId, clone: cloneData }) => {
      const userClone = UserClone.fromJSON(cloneData);
      graph.registerUser(userId, userClone);
    });

    // Restore segments
    data.segments.forEach(({ segmentId, users, similarity }) => {
      graph.segments.set(segmentId, {
        users: new Set(users),
        similarity,
        profile: null,
        commonPatterns: []
      });
    });

    // Restore recommendations
    data.recommendations.forEach(([userId, recs]) => {
      graph.actionRecommendations.set(userId, recs);
    });

    return graph;
  }
}

module.exports = { IntelligenceGraph };
