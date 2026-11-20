"""An unavailable engine must never be treated as a missing Docker resource."""
from pathlib import Path
import runpy
import subprocess
import unittest
from unittest.mock import patch


SCRIPT = Path(__file__).resolve().parents[1] / 'deployment/start_local_operation.py'


class DockerStartupTests(unittest.TestCase):
    def check_failure(self, message, **mock_options):
        with patch('subprocess.run', **mock_options) as docker:
            with self.assertRaisesRegex(RuntimeError, message):
                runpy.run_path(str(SCRIPT), run_name='__main__')
        docker.assert_called_once()
        self.assertEqual(docker.call_args.args[0], ['docker', 'info'])
        self.assertEqual(docker.call_args.kwargs['timeout'], 30)

    def test_stopped_engine_does_not_attempt_resource_creation(self):
        self.check_failure(
            'No se pudo conectar al motor',
            return_value=subprocess.CompletedProcess(['docker', 'info'], 1),
        )

    def test_missing_docker_has_actionable_message(self):
        self.check_failure('PATH', side_effect=FileNotFoundError())

    def test_unresponsive_engine_has_bounded_wait(self):
        self.check_failure(
            'Docker no responde',
            side_effect=subprocess.TimeoutExpired(['docker', 'info'], 30),
        )
