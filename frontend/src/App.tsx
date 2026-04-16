/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import Marketplace from './pages/Marketplace';
import AdminControl from './pages/AdminControl';
import AIEngine from './pages/AIEngine';
import Workflows from './pages/Workflows';
import TaskLoop from './pages/TaskLoop';
import Documentation from './pages/Documentation';
import MasterAdmin from './pages/MasterAdmin';
import OrchestrationHub from './pages/OrchestrationHub';
import HumanAPI from './pages/HumanAPI';
import MultiagentOrchestration from './pages/MultiagentOrchestration';

function PageWrapper({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 15, filter: 'blur(4px)' }}
      animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
      exit={{ opacity: 0, y: -15, filter: 'blur(4px)' }}
      transition={{ duration: 0.4, ease: [0.2, 0.8, 0.2, 1] }}
    >
      {children}
    </motion.div>
  );
}

function AnimatedRoutes() {
  const location = useLocation();
  return (
    <AnimatePresence mode="wait">
      <Routes location={location} key={location.pathname}>
        <Route path="/" element={<PageWrapper><Marketplace /></PageWrapper>} />
        <Route path="/admin" element={<PageWrapper><AdminControl /></PageWrapper>} />
        <Route path="/engine" element={<PageWrapper><AIEngine /></PageWrapper>} />
        <Route path="/workflows" element={<PageWrapper><Workflows /></PageWrapper>} />
        <Route path="/loop" element={<PageWrapper><TaskLoop /></PageWrapper>} />
        <Route path="/docs" element={<PageWrapper><Documentation /></PageWrapper>} />
        <Route path="/master" element={<PageWrapper><MasterAdmin /></PageWrapper>} />
        <Route path="/orchestration" element={<PageWrapper><OrchestrationHub /></PageWrapper>} />
        <Route path="/human" element={<PageWrapper><HumanAPI /></PageWrapper>} />
        <Route path="/multiagent" element={<PageWrapper><MultiagentOrchestration /></PageWrapper>} />
      </Routes>
    </AnimatePresence>
  );
}

export default function App() {
  return (
    <Router>
      <AnimatedRoutes />
    </Router>
  );
}