#!/usr/bin/env python3
"""
Spec Compliance Validator

Validates PR changes against AGENTS.md specification rules.
This script runs in CI/CD to prevent merging of non-compliant changes.
"""

import os
import sys
import re
import yaml
from pathlib import Path
from typing import Dict, List, Any, Tuple

class SpecComplianceValidator:
    """Validates code changes against AGENTS.md specification"""

    def __init__(self):
        self.project_root = Path(__file__).parent.parent.parent
        self.agents_spec = self._load_agents_spec()
        self.changed_files = self._get_changed_files()

    def _load_agents_spec(self) -> Dict[str, Any]:
        """Load AGENTS.md specification"""
        agents_path = self.project_root / "Supa-Claw" / "AGENTS.md"

        if not agents_path.exists():
            print(f"[ERROR] AGENTS.md not found at {agents_path}")
            return {}

        try:
            with open(agents_path, 'r', encoding='utf-8', errors='replace') as f:
                content = f.read()

            # Parse specification rules
            return self._parse_spec_rules(content)
        except Exception as e:
            print(f"❌ Failed to load AGENTS.md: {e}")
            return {}

    def _parse_spec_rules(self, content: str) -> Dict[str, Any]:
        """Parse AGENTS.md for enforceable rules"""
        rules = {
            "ui_changes_required": False,
            "animation_required": False,
            "visual_verification_required": False,
            "state_management_required": False,
            "testing_required": True,  # Always required
            "logging_required": True,  # Always required
            "architecture_compliance_required": True  # Always required
        }

        # Look for UI/animation requirements in spec
        if "frontend" in content.lower() or "ui" in content.lower():
            rules["ui_changes_required"] = True

        if "animation" in content.lower() or "transition" in content.lower():
            rules["animation_required"] = True

        if "visual" in content.lower() or "design" in content.lower():
            rules["visual_verification_required"] = True

        if "state" in content.lower() or "context" in content.lower():
            rules["state_management_required"] = True

        return rules

    def _get_changed_files(self) -> List[str]:
        """Get list of files changed in PR"""
        # In GitHub Actions, use git diff
        if os.getenv('GITHUB_ACTIONS'):
            import subprocess
            try:
                result = subprocess.run(
                    ['git', 'diff', '--name-only', 'HEAD~1'],
                    capture_output=True, text=True, cwd=self.project_root
                )
                return result.stdout.strip().split('\n') if result.stdout.strip() else []
            except Exception as e:
                print(f"Warning: Could not get changed files: {e}")
                return []

        # For local testing, check recent commits
        return ["backend/main.py", "frontend/index.html"]  # Mock for testing

    def validate_spec_compliance(self) -> Tuple[bool, List[str]]:
        """Validate that changes comply with specification"""
        violations = []

        # Check each rule
        if self.agents_spec.get("ui_changes_required"):
            if not self._has_ui_changes():
                violations.append("[VIOLATION] UI changes required but no frontend files modified")

        if self.agents_spec.get("animation_required"):
            if not self._has_animation_changes():
                violations.append("[VIOLATION] Animation implementation required but no animation code found")

        if self.agents_spec.get("visual_verification_required"):
            if not self._has_visual_tests():
                violations.append("[VIOLATION] Visual verification required but no visual regression tests found")

        if self.agents_spec.get("state_management_required"):
            if not self._has_state_management():
                violations.append("[VIOLATION] State management required but no state handling found")

        # Always check these
        if self.agents_spec.get("testing_required"):
            if not self._has_tests():
                violations.append("[VIOLATION] Tests required but no test files found or updated")

        if self.agents_spec.get("logging_required"):
            if not self._has_logging():
                violations.append("[VIOLATION] Logging required but insufficient logging found")

        if self.agents_spec.get("architecture_compliance_required"):
            if not self._complies_with_architecture():
                violations.append("[VIOLATION] Architecture compliance required but violations found")

        return len(violations) == 0, violations

    def _has_ui_changes(self) -> bool:
        """Check if UI files were modified"""
        ui_files = [f for f in self.changed_files if any(ext in f.lower() for ext in ['.html', '.css', '.js', '.tsx', '.jsx', '.vue'])]
        return len(ui_files) > 0

    def _has_animation_changes(self) -> bool:
        """Check if animation code was added/modified"""
        for file in self.changed_files:
            if file.endswith(('.css', '.js', '.ts', '.tsx')):
                file_path = self.project_root / file
                if file_path.exists():
                    try:
                        with open(file_path, 'r', encoding='utf-8', errors='replace') as f:
                            content = f.read().lower()
                            # Check for animation keywords
                            animation_keywords = ['animation', 'transition', 'keyframes', 'transform', 'opacity']
                            if any(keyword in content for keyword in animation_keywords):
                                return True
                    except Exception:
                        continue
        return False

    def _has_visual_tests(self) -> bool:
        """Check if visual regression tests exist"""
        visual_test_files = [f for f in self.changed_files if 'visual' in f.lower() and 'test' in f.lower()]
        return len(visual_test_files) > 0

    def _has_state_management(self) -> bool:
        """Check if state management code exists"""
        for file in self.changed_files:
            if file.endswith(('.js', '.ts', '.tsx', '.py')):
                file_path = self.project_root / file
                if file_path.exists():
                    try:
                        with open(file_path, 'r', encoding='utf-8', errors='replace') as f:
                            content = f.read().lower()
                            # Check for state management patterns
                            state_keywords = ['state', 'context', 'reducer', 'store', 'dispatch']
                            if any(keyword in content for keyword in state_keywords):
                                return True
                    except Exception:
                        continue
        return False

    def _has_tests(self) -> bool:
        """Check if test files exist and were modified"""
        test_files = [f for f in self.changed_files if 'test' in f.lower() or f.endswith('.spec.js') or f.endswith('.spec.ts')]
        return len(test_files) > 0

    def _has_logging(self) -> bool:
        """Check if sufficient logging exists"""
        total_log_statements = 0

        for file in self.changed_files:
            if file.endswith(('.py', '.js', '.ts', '.tsx')):
                file_path = self.project_root / file
                if file_path.exists():
                    try:
                        with open(file_path, 'r', encoding='utf-8', errors='replace') as f:
                            content = f.read()
                            # Count logging statements
                            log_patterns = [r'logger\.', r'console\.log', r'logging\.', r'log\.']
                            for pattern in log_patterns:
                                total_log_statements += len(re.findall(pattern, content, re.IGNORECASE))
                    except Exception:
                        continue

        return total_log_statements >= 3  # Require at least 3 log statements in changed files

    def _complies_with_architecture(self) -> bool:
        """Check if changes comply with architectural patterns"""
        # Check for architectural violations
        violations = []

        for file in self.changed_files:
            if file.endswith('.py'):
                file_path = self.project_root / file
                if file_path.exists():
                    try:
                        with open(file_path, 'r', encoding='utf-8', errors='replace') as f:
                            content = f.read()

                            # Check for direct database access in endpoints (violates architecture)
                            if 'def ' in content and ('sqlite' in content.lower() or 'database' in content.lower()):
                                # Allow if it's in a designated data layer
                                if not ('repository' in file.lower() or 'service' in file.lower()):
                                    violations.append(f"Direct database access in {file} (use repository pattern)")

                    except Exception:
                        continue

        return len(violations) == 0

def main():
    """Main validation function"""
    print("[VALIDATE] Starting Spec Compliance Validation...")
    print(f"Project root: {Path(__file__).parent.parent.parent}")
    print(f"Changed files: {os.getenv('CHANGED_FILES', 'detecting...')}")

    validator = SpecComplianceValidator()

    if not validator.agents_spec:
        print("[ERROR] Could not load AGENTS.md specification")
        sys.exit(1)

    print(f"[OK] Loaded spec rules: {len(validator.agents_spec)} rules")
    print(f"[INFO] Changed files: {len(validator.changed_files)} files")

    compliant, violations = validator.validate_spec_compliance()

    if compliant:
        print("[PASS] Spec compliance validation PASSED")
        print("[SUCCESS] All changes comply with AGENTS.md specification")
        sys.exit(0)
    else:
        print("[FAIL] Spec compliance validation FAILED")
        print("\nViolations found:")
        for violation in violations:
            print(f"  - {violation}")
        print("\n[INFO] Fix the violations and update your PR")
        sys.exit(1)

if __name__ == "__main__":
    main()