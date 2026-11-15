"""Regression checks for serving long ambience files in small byte ranges."""

import http.client
import tempfile
import threading
import unittest
from http.server import ThreadingHTTPServer
from pathlib import Path

from server import MusicPlayerHandler


class AudioRangeTests(unittest.TestCase):
    def test_music_file_supports_ranges(self):
        with tempfile.TemporaryDirectory() as directory:
            Path(directory, 'sound.mp3').write_bytes(b'abcdefghijklmnopqrstuvwxyz')
            handler = lambda *args, **kwargs: MusicPlayerHandler(
                *args, music_folder=directory, **kwargs
            )
            server = ThreadingHTTPServer(('127.0.0.1', 0), handler)
            thread = threading.Thread(target=server.serve_forever, daemon=True)
            thread.start()
            try:
                connection = http.client.HTTPConnection('127.0.0.1', server.server_port)
                connection.request('GET', '/music/sound.mp3', headers={'Range': 'bytes=5-9'})
                response = connection.getresponse()
                self.assertEqual(response.status, 206)
                self.assertEqual(response.getheader('Content-Range'), 'bytes 5-9/26')
                self.assertEqual(response.getheader('Content-Length'), '5')
                self.assertEqual(response.read(), b'fghij')
                connection.close()

                connection = http.client.HTTPConnection('127.0.0.1', server.server_port)
                connection.request('GET', '/music/sound.mp3', headers={'Range': 'bytes=-4'})
                response = connection.getresponse()
                self.assertEqual(response.status, 206)
                self.assertEqual(response.read(), b'wxyz')
                connection.close()

                connection = http.client.HTTPConnection('127.0.0.1', server.server_port)
                connection.request('GET', '/music/sound.mp3', headers={'Range': 'bytes=99-'})
                response = connection.getresponse()
                self.assertEqual(response.status, 416)
                self.assertEqual(response.getheader('Content-Range'), 'bytes */26')
                connection.close()
            finally:
                server.shutdown()
                server.server_close()
                thread.join()


if __name__ == '__main__':
    unittest.main()
