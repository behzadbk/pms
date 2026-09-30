"""Exercise deployment state and rollback with real Git and mocked Docker/HTTP.

Run on Linux: python3 tests/test_vps_deploy.py
No production containers, network services, or databases are modified.
"""
import json
import os
from pathlib import Path
import shlex
import subprocess
import tempfile
import unittest

SCRIPT = Path(__file__).resolve().parents[1] / 'scripts/deploy-vps.sh'
MOCK = r'''#!/usr/bin/env python3
import json, os, sys
from pathlib import Path
name, args = Path(sys.argv[0]).name, sys.argv[1:]
with open(os.environ['CALL_LOG'], 'a') as f:
    f.write(json.dumps([name, *args]) + '\n')
failure = os.environ.get('CASE_FAILURE', '')
if name == 'curl':
    sys.exit(22 if failure == 'health' else 0)
if args[0] == 'ps':
    print('old-container')
elif args[0] == 'inspect':
    print(json.dumps([{'Config': {'Labels': {'com.docker.compose.service': 'frontend'}}, 'Image': 'sha256:old-image'}]))
elif args[0] == 'compose':
    if 'build' in args and failure == 'build': sys.exit(42)
    if 'pg_dump' in args: print('-- database backup')
    if 'up' in args and '--no-build' in args and failure == 'activation':
        directory = args[args.index('--project-directory') + 1]
        if not directory.endswith('/baseline'): sys.exit(43)
'''


class DeploymentTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='pms-deploy-test-')
        self.root = Path(self.temp.name)
        self.repo = self.root / 'repository'
        self.repo.mkdir()
        self.git('init', '-q', '-b', 'main')
        self.git('config', 'user.name', 'Deployment Test')
        self.git('config', 'user.email', 'deployment-test@example.test')
        (self.repo / 'docker-compose.yml').write_text('services:\n  frontend:\n    image: example/frontend\n')
        (self.repo / 'README.md').write_text('old\n')
        (self.repo / 'frontend').mkdir()
        (self.repo / 'frontend/app.txt').write_text('old frontend\n')
        self.git('add', '.')
        self.git('commit', '-qm', 'Initial release')
        self.old_sha = self.git('rev-parse', 'HEAD').strip()
        (self.repo / 'frontend/app.txt').write_text('new frontend\n')
        self.git('add', '.')
        self.git('commit', '-qm', 'New release')
        self.new_sha = self.git('rev-parse', 'HEAD').strip()
        self.state = self.root / 'state'
        self.state.mkdir()
        self.baseline = self.root / 'baseline'
        self.baseline.mkdir()
        (self.baseline / 'docker-compose.yml').write_text((self.repo / 'docker-compose.yml').read_text())
        (self.state / 'current-release').write_text(str(self.baseline) + '\n')
        (self.state / 'deployed-sha').write_text(self.old_sha + '\n')
        envfile = self.root / 'production.env'
        envfile.write_text('PUBLIC_URL=https://example.test\n')
        self.bootstrap = self.root / 'bootstrap'
        self.bootstrap.mkdir()
        config = self.root / 'config'
        config.write_text('\n'.join(f'{key}={shlex.quote(str(value))}' for key, value in {
            'STATE_DIR': self.state,
            'RELEASES_DIR': self.root / 'releases',
            'ENV_FILE': envfile,
            'REPOSITORY': self.repo,
            'PUBLIC_URL': 'https://example.test',
            'BOOTSTRAP_DIR': self.bootstrap,
        }.items()) + '\n')
        bin_dir = self.root / 'bin'
        bin_dir.mkdir()
        for name in ['docker', 'curl']:
            command = bin_dir / name
            command.write_text(MOCK)
            command.chmod(0o700)
        self.log = self.root / 'calls.jsonl'
        self.env = dict(os.environ, PMS_DEPLOY_CONFIG=str(config), CALL_LOG=str(self.log), PATH=str(bin_dir) + ':' + os.environ['PATH'])

    def tearDown(self):
        self.temp.cleanup()

    def git(self, *args):
        return subprocess.check_output(['git', '-C', str(self.repo), *args], text=True)

    def run_deploy(self, failure='', retry=False):
        return subprocess.run(['bash', str(SCRIPT), *(['--retry'] if retry else [])], env=dict(self.env, CASE_FAILURE=failure), text=True, capture_output=True, timeout=30)

    def calls(self):
        return [json.loads(line) for line in self.log.read_text().splitlines()]

    def test_success_then_unchanged_commit_does_not_rebuild(self):
        first = self.run_deploy()
        self.assertEqual(first.returncode, 0, first.stderr)
        self.assertEqual((self.state / 'deployed-sha').read_text().strip(), self.new_sha)
        self.assertTrue(list((self.state / 'backups').glob('*.sql.gz')))
        builds = [call for call in self.calls() if 'build' in call]
        self.assertEqual(len(builds), 2)
        self.assertEqual(builds[-1][-2:], ['build', 'frontend'])
        count = len(self.calls())
        second = self.run_deploy()
        self.assertEqual(second.returncode, 0, second.stderr)
        self.assertEqual(len(self.calls()), count)

    def test_shared_change_builds_each_application_separately(self):
        (self.repo / 'docker-compose.yml').write_text((self.repo / 'docker-compose.yml').read_text() + '# shared change\n')
        self.git('add', '.')
        self.git('commit', '-qm', 'Shared configuration change')
        result = self.run_deploy()
        self.assertEqual(result.returncode, 0, result.stderr)
        builds = [call for call in self.calls() if 'build' in call]
        self.assertEqual(len(builds), 10)
        self.assertEqual({call[-1] for call in builds}, {'migrate', 'identity-svc', 'property-svc', 'facility-svc', 'finance-svc', 'guard-svc', 'notification-svc', 'audit-svc', 'fnb-svc', 'frontend'})
        self.assertTrue(all(call[-2] == 'build' for call in builds))

    def test_build_failure_preserves_current_release_and_blocks_repeat(self):
        result = self.run_deploy('build')
        self.assertEqual(result.returncode, 42, result.stderr)
        self.assertEqual((self.state / 'deployed-sha').read_text().strip(), self.old_sha)
        self.assertFalse(any('up' in call for call in self.calls()))
        count = len(self.calls())
        self.assertEqual(self.run_deploy().returncode, 1)
        self.assertEqual(len(self.calls()), count)
        self.assertEqual(self.run_deploy(retry=True).returncode, 0)

    def test_activation_failure_restores_pinned_previous_images(self):
        result = self.run_deploy('activation')
        self.assertEqual(result.returncode, 43, result.stderr)
        self.assertEqual((self.state / 'current-release').read_text().strip(), str(self.baseline))
        self.assertEqual(json.loads((self.state / 'rollback-images.json').read_text())['services']['frontend']['image'], 'sha256:old-image')
        self.assertTrue(any('up' in call and str(self.baseline) in call and str(self.state / 'rollback-images.json') in call for call in self.calls()))

    def test_health_failure_does_not_mark_new_commit_deployed(self):
        result = self.run_deploy('health')
        self.assertEqual(result.returncode, 22, result.stderr)
        self.assertEqual((self.state / 'deployed-sha').read_text().strip(), self.old_sha)
        self.assertIn('Previous application images restored.', result.stderr)

    def test_bootstrap_patch_is_applied_to_release(self):
        (self.bootstrap / 'production.patch').write_text('diff --git a/README.md b/README.md\n--- a/README.md\n+++ b/README.md\n@@ -1 +1 @@\n-old\n+production\n')
        result = self.run_deploy()
        self.assertEqual(result.returncode, 0, result.stderr)
        release = Path((self.state / 'current-release').read_text().strip())
        self.assertEqual((release / 'README.md').read_text(), 'production\n')


if __name__ == '__main__':
    unittest.main()
