#!/usr/bin/env python3
"""
D&D Music Player - Web Server
Serves music files and the player interface
"""

import os
import json
import mimetypes
import subprocess
import sys
import re
import shutil
from pathlib import Path
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from urllib.parse import parse_qs, urlparse, unquote
import webbrowser
import threading
import time
from queue import Queue

# Global storage for download progress
download_progress = {}


def log(message):
    """Keep background downloads alive when the Windows console cannot print a title."""
    encoding = sys.stdout.encoding or 'utf-8'
    print(str(message).encode(encoding, errors='backslashreplace').decode(encoding))


class MusicPlayerHandler(SimpleHTTPRequestHandler):
    """Custom HTTP handler for the music player"""

    def __init__(self, *args, music_folder=None, **kwargs):
        self.music_folder_path = music_folder
        super().__init__(*args, directory=str(Path(__file__).resolve().parents[2]), **kwargs)

    def do_GET(self):
        """Handle GET requests"""
        parsed_path = urlparse(self.path)

        # API endpoint to list music files
        if parsed_path.path == '/api/music':
            self.serve_music_list()
        # API endpoint to list ambience sounds
        elif parsed_path.path == '/api/ambience':
            self.serve_ambience_list()
        # Progress stream endpoint
        elif parsed_path.path.startswith('/api/progress/'):
            download_id = parsed_path.path.split('/')[-1]
            self.stream_progress(download_id)
        # Serve music files
        elif parsed_path.path.startswith('/music/'):
            self.serve_music_file(parsed_path.path)
        # Serve ambience files
        elif parsed_path.path.startswith('/ambience/'):
            self.serve_ambience_file(parsed_path.path)
        else:
            super().do_GET()

    def do_POST(self):
        """Handle POST requests"""
        parsed_path = urlparse(self.path)
        origin = self.headers.get('Origin')
        if origin and origin != 'http://127.0.0.1:8765':
            self.send_error(403, 'Origin not allowed')
            return

        if parsed_path.path == '/api/download':
            self.handle_youtube_download()
        elif parsed_path.path == '/api/rename':
            self.handle_rename()
        else:
            self.send_error(404, "Endpoint not found")

    def handle_rename(self):
        try:
            data = json.loads(self.rfile.read(int(self.headers['Content-Length'])))
            result = rename_audio_file(data.get('path', ''), data.get('name', ''), self.music_folder_path)
            self.send_json_response(200, result)
        except (ValueError, FileNotFoundError) as error:
            self.send_json_response(400, {'error': str(error)})
        except FileExistsError as error:
            self.send_json_response(409, {'error': str(error)})
        except OSError:
            self.send_json_response(409, {'error': 'File in uso: ferma la riproduzione prima di rinominarlo.'})

    def handle_youtube_download(self):
        """Handle YouTube download request"""
        try:
            # Read request body
            content_length = int(self.headers['Content-Length'])
            body = self.rfile.read(content_length)
            data = json.loads(body.decode('utf-8'))

            url = data.get('url', '').strip()
            folder = data.get('folder', '').strip()
            custom_name = data.get('name', '').strip()
            playlist = data.get('playlist') is True
            cookie_browser = data.get('cookieBrowser', '')
            download_id = data.get('downloadId', str(time.time()))

            if not url:
                self.send_json_response(400, {"error": "URL is required"})
                return
            if cookie_browser not in ('', 'chrome', 'edge', 'firefox'):
                self.send_json_response(400, {'error': 'Browser non valido.'})
                return

            # Validate URL
            parsed_url = urlparse(url)
            if parsed_url.scheme not in ('http', 'https') or parsed_url.hostname not in ('youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtu.be'):
                self.send_json_response(400, {"error": "Invalid YouTube URL"})
                return

            # Check if yt-dlp is installed
            if not check_ytdlp():
                self.send_json_response(500, {
                    "error": "yt-dlp is not installed. Please install it with: pip install yt-dlp"
                })
                return

            # Check if ffmpeg is installed
            if not check_ffmpeg():
                self.send_json_response(500, {
                    "error": "ffmpeg is not installed. Please install ffmpeg to convert audio formats. See README for instructions."
                })
                return

            # Determine download path
            if folder:
                # Sanitize folder name
                folder = re.sub(r'[<>:"/\\|?*]', '', folder).strip()
                if folder in ('', '.', '..'):
                    self.send_json_response(400, {"error": "Nome cartella non valido"})
                    return
                download_path = Path(self.music_folder_path) / folder
                download_path.mkdir(parents=True, exist_ok=True)
            else:
                download_path = Path(self.music_folder_path)
            if custom_name:
                try:
                    if custom_name.lower().endswith('.mp3'):
                        custom_name = custom_name[:-4]
                    custom_name = validate_audio_name(custom_name)
                except ValueError as error:
                    self.send_json_response(400, {'error': str(error)})
                    return
                if not playlist and (download_path / f'{custom_name}.mp3').exists():
                    self.send_json_response(409, {'error': 'Esiste già un MP3 con questo nome.'})
                    return

            # Initialize progress tracking
            download_progress[download_id] = {
                'status': 'starting',
                'percent': 0,
                'message': 'Initializing download...'
            }

            # Start download in background thread
            def download_thread():
                result = download_youtube_audio(url, str(download_path), download_id, custom_name, playlist, cookie_browser)
                if result['success']:
                    download_progress[download_id] = {
                        'status': 'complete',
                        'filename': result['filename'],
                        'filenames': result['filenames']
                    }
                else:
                    download_progress[download_id] = {
                        'status': 'error',
                        'error': result['error']
                    }

            thread = threading.Thread(target=download_thread)
            thread.daemon = True
            thread.start()

            # Send immediate success response
            self.send_json_response(200, {
                "success": True,
                "downloadId": download_id,
                "cookieBrowser": cookie_browser
            })

        except json.JSONDecodeError:
            self.send_json_response(400, {"error": "Invalid JSON"})
        except Exception as e:
            self.send_json_response(500, {"error": str(e)})

    def stream_progress(self, download_id):
        """Stream download progress using Server-Sent Events"""
        self.send_response(200)
        self.send_header('Content-Type', 'text/event-stream')
        self.send_header('Cache-Control', 'no-cache')
        self.send_header('Connection', 'keep-alive')
        self.end_headers()

        try:
            while True:
                if download_id in download_progress:
                    progress_data = download_progress[download_id]
                    event_data = f"data: {json.dumps(progress_data)}\n\n"
                    self.wfile.write(event_data.encode())
                    self.wfile.flush()

                    # If download is complete or error, clean up and close
                    if progress_data['status'] in ['complete', 'error']:
                        time.sleep(0.5)  # Give client time to receive final message
                        # Clean up progress data after 5 seconds
                        threading.Timer(5.0, lambda: download_progress.pop(download_id, None)).start()
                        break

                time.sleep(0.5)  # Poll every 500ms
        except (BrokenPipeError, ConnectionResetError):
            # Client disconnected
            pass

    def send_json_response(self, status_code, data):
        """Send a JSON response"""
        response = json.dumps(data)
        self.send_response(status_code)
        self.send_header('Content-type', 'application/json')
        self.send_header('Content-Length', len(response.encode('utf-8')))
        self.end_headers()
        self.wfile.write(response.encode())

    def serve_music_list(self):
        """Return a JSON list of all music files organized by folders"""
        try:
            music_data = self.scan_music_folder(self.music_folder_path)
            site_audio = Path(__file__).resolve().parents[2] / 'assets' / 'audio'
            if site_audio.is_dir():
                for file_path in site_audio.rglob('*'):
                    if file_path.is_file() and file_path.suffix.lower() in {'.mp3', '.wav', '.ogg', '.m4a', '.flac'}:
                        rel = file_path.relative_to(site_audio)
                        folder = '/'.join(rel.parts[:-1])
                        music_data['files'].append({"name": file_path.name, "path": '/assets/audio/' + rel.as_posix(), "folder": 'Sito' + ('/' + folder if folder else ''), "size": file_path.stat().st_size})
                music_data['files'].sort(key=lambda item: (item['folder'], item['name']))
                music_data['folders'] = sorted({item['folder'] for item in music_data['files']})
            response = json.dumps(music_data, indent=2)

            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.send_header('Content-Length', len(response.encode('utf-8')))
            self.end_headers()
            self.wfile.write(response.encode())
        except Exception as e:
            error_msg = json.dumps({"error": str(e)})
            self.send_response(500)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            self.wfile.write(error_msg.encode())

    def scan_music_folder(self, folder_path):
        """Scan the music folder and return organized structure"""
        music_files = []
        supported_formats = {'.mp3', '.wav', '.ogg', '.m4a', '.flac'}

        folder = Path(folder_path)
        if not folder.exists():
            return {"folders": [], "files": []}

        # Recursively find all music files
        for file_path in folder.rglob('*'):
            if file_path.is_file() and file_path.suffix.lower() in supported_formats:
                # Get relative path from music folder
                rel_path = file_path.relative_to(folder)
                folder_parts = list(rel_path.parts[:-1])

                music_files.append({
                    "name": file_path.name,
                    "path": f"/music/{rel_path.as_posix()}",
                    "folder": '/'.join(folder_parts) if folder_parts else "Root",
                    "size": file_path.stat().st_size
                })

        # Sort by folder and name
        music_files.sort(key=lambda x: (x['folder'], x['name']))

        # Get unique folders
        folders = sorted(set(f['folder'] for f in music_files))

        return {
            "folders": folders,
            "files": music_files
        }

    def serve_music_file(self, path):
        """Serve a music file"""
        # Remove '/music/' prefix and decode URL
        file_path = unquote(path[7:])
        full_path = Path(self.music_folder_path) / file_path

        # Security check: make sure the path is within music folder
        try:
            full_path = full_path.resolve()
            music_folder = Path(self.music_folder_path).resolve()
            if not full_path.is_relative_to(music_folder):
                self.send_error(403, "Access denied")
                return
        except Exception:
            self.send_error(400, "Invalid path")
            return

        if not full_path.exists() or not full_path.is_file():
            self.send_error(404, "File not found")
            return

        self.send_audio_file(full_path)

    def serve_ambience_list(self):
        """Return a JSON list of all ambience sound files"""
        try:
            ambience_folder = Path(__file__).parent / 'ambience'
            ambience_data = self.scan_ambience_folder(ambience_folder)
            ambience_data['version'] = 6
            response = json.dumps(ambience_data, indent=2)

            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.send_header('Cache-Control', 'no-store')
            self.send_header('Content-Length', len(response.encode('utf-8')))
            self.end_headers()
            self.wfile.write(response.encode())
        except Exception as e:
            error_msg = json.dumps({"error": str(e)})
            self.send_response(500)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            self.wfile.write(error_msg.encode())

    def scan_ambience_folder(self, folder_path):
        """Scan the ambience folder and return file list"""
        ambience_files = []
        supported_formats = {'.mp3', '.wav', '.ogg', '.m4a', '.flac'}

        # Files downloaded with "Save to Folder: ambience" live inside music.
        sources = [
            (Path(folder_path), '/ambience'),
            (Path(self.music_folder_path) / 'ambience', '/music/ambience')
        ]
        for folder, url_prefix in sources:
            if not folder.is_dir():
                continue
            for file_path in folder.glob('*'):
                if file_path.is_file() and file_path.suffix.lower() in supported_formats:
                    ambience_files.append({
                        "name": file_path.name,
                        "path": f"{url_prefix}/{file_path.name}",
                        "size": file_path.stat().st_size
                    })

        # Sort by name
        ambience_files.sort(key=lambda x: x['name'])

        return {"files": ambience_files}

    def serve_ambience_file(self, path):
        """Serve an ambience sound file"""
        # Remove '/ambience/' prefix and decode URL
        file_path = unquote(path[10:])
        ambience_folder = Path(__file__).parent / 'ambience'
        full_path = ambience_folder / file_path

        # Security check
        try:
            full_path = full_path.resolve()
            ambience_folder = ambience_folder.resolve()
            if not full_path.is_relative_to(ambience_folder):
                self.send_error(403, "Access denied")
                return
        except Exception:
            self.send_error(400, "Invalid path")
            return

        if not full_path.exists() or not full_path.is_file():
            self.send_error(404, "File not found")
            return

        self.send_audio_file(full_path)

    def send_audio_file(self, full_path):
        """Stream audio and honor the byte ranges requested by media players."""
        try:
            source = open(full_path, 'rb')
        except OSError as error:
            self.send_error(500, f"Error serving file: {error}")
            return

        with source:
            size = os.fstat(source.fileno()).st_size
            start, end = 0, size - 1
            range_header = self.headers.get('Range')
            if range_header:
                match = re.fullmatch(r'bytes=(\d*)-(\d*)', range_header.strip())
                if not match or not any(match.groups()):
                    self.send_audio_range_error(size)
                    return
                first, last = match.groups()
                if first:
                    start = int(first)
                    end = min(int(last), size - 1) if last else size - 1
                else:
                    suffix = int(last)
                    start = max(size - suffix, 0)
                if start >= size or end < start or (not first and not suffix):
                    self.send_audio_range_error(size)
                    return

            length = end - start + 1
            mime_type = mimetypes.guess_type(str(full_path))[0] or 'application/octet-stream'
            self.send_response(206 if range_header else 200)
            self.send_header('Content-type', mime_type)
            self.send_header('Content-Length', str(length))
            self.send_header('Accept-Ranges', 'bytes')
            if range_header:
                self.send_header('Content-Range', f'bytes {start}-{end}/{size}')
            self.end_headers()

            source.seek(start)
            try:
                while length:
                    chunk = source.read(min(length, 64 * 1024))
                    if not chunk:
                        break
                    self.wfile.write(chunk)
                    length -= len(chunk)
            except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
                pass

    def send_audio_range_error(self, size):
        self.send_response(416)
        self.send_header('Content-Range', f'bytes */{size}')
        self.send_header('Content-Length', '0')
        self.end_headers()

    def log_message(self, format, *args):
        """Custom log format"""
        print(f"[{self.log_date_time_string()}] {format % args}")


def validate_audio_name(name):
    if not isinstance(name, str) or not name.strip() or name.strip(' .') != name.strip():
        raise ValueError('Nome file non valido.')
    if any(char in name for char in '<>:"/\\|?*') or any(ord(char) < 32 for char in name):
        raise ValueError('Il nome contiene caratteri non validi.')
    if name.upper().split('.')[0] in {'CON', 'PRN', 'AUX', 'NUL', *(f'COM{i}' for i in range(1, 10)), *(f'LPT{i}' for i in range(1, 10))}:
        raise ValueError('Nome file riservato dal sistema.')
    return name.strip()


def rename_audio_file(path, name, music_folder, project_root=None):
    if not isinstance(path, str):
        raise ValueError('Percorso non valido.')
    project_root = Path(project_root or Path(__file__).resolve().parents[2]).resolve()
    sources = (
        ('/music/', Path(music_folder)),
        ('/ambience/', Path(__file__).parent / 'ambience'),
        ('/assets/audio/', project_root / 'assets' / 'audio'),
    )
    match = next(((prefix, root) for prefix, root in sources if path.startswith(prefix)), None)
    if not match:
        raise ValueError('Si possono rinominare solo i file audio delle librerie locali.')
    prefix, root = match
    root = root.resolve()
    original = (root / unquote(path[len(prefix):])).resolve()
    if not original.is_relative_to(root) or not original.is_file():
        raise FileNotFoundError('File audio non trovato.')
    new_name = validate_audio_name(name)
    if new_name.lower().endswith(original.suffix.lower()):
        new_name = new_name[:-len(original.suffix)]
    new_name = validate_audio_name(new_name)
    renamed = original.with_name(new_name + original.suffix)
    if renamed != original:
        if renamed.exists():
            raise FileExistsError('Esiste già un file con questo nome.')
        updates = []
        if prefix == '/assets/audio/':
            old_ref = 'assets/audio/' + original.relative_to(root).as_posix()
            new_ref = 'assets/audio/' + renamed.relative_to(root).as_posix()
            for data_file in (project_root / 'assets' / 'data').rglob('*.json'):
                content = data_file.read_text(encoding='utf-8')
                updated = content.replace(old_ref + '"', new_ref + '"')
                if updated != content:
                    updates.append((data_file, content, updated))
        original.rename(renamed)
        written = []
        try:
            for data_file, content, updated in updates:
                data_file.write_text(updated, encoding='utf-8')
                written.append((data_file, content))
        except OSError:
            for data_file, content in written:
                data_file.write_text(content, encoding='utf-8')
            renamed.rename(original)
            raise
    relative = renamed.relative_to(root).as_posix()
    return {'oldPath': path, 'path': prefix + relative, 'name': renamed.name}


def check_ytdlp():
    """Check if yt-dlp is installed"""
    try:
        subprocess.run(['yt-dlp', '--version'],
                      stdout=subprocess.DEVNULL,
                      stderr=subprocess.DEVNULL,
                      check=True)
        return True
    except (subprocess.CalledProcessError, FileNotFoundError):
        return False


def check_ffmpeg():
    """Check if ffmpeg is installed"""
    try:
        subprocess.run(['ffmpeg', '-version'],
                      stdout=subprocess.DEVNULL,
                      stderr=subprocess.DEVNULL,
                      check=True)
        return True
    except (subprocess.CalledProcessError, FileNotFoundError):
        return False


def download_youtube_audio(url, output_path, download_id=None, custom_name='', playlist=False, cookie_browser=''):
    """
    Download audio from YouTube using yt-dlp

    Args:
        url: YouTube video URL
        output_path: Directory to save the audio file
        download_id: Optional download ID for progress tracking

    Returns:
        dict: Result with success status, filename, and path or error message
    """
    try:
        # Configure yt-dlp options
        if playlist:
            filename_template = f'{custom_name} - %(playlist_index)s - %(title)s.%(ext)s' if custom_name else '%(playlist_index)s - %(title)s.%(ext)s'
        else:
            filename_template = f'{custom_name}.%(ext)s' if custom_name else '%(title)s.%(ext)s'
        output_template = os.path.join(output_path, filename_template)

        command = [
            'yt-dlp',
            '--extract-audio',
            '--audio-format', 'mp3',
            '--audio-quality', '0',  # Best quality
            '--output', output_template,
            '--yes-playlist' if playlist else '--no-playlist',
            '--newline',  # Output progress on new lines for easier parsing
            '--progress',  # Show progress
            '--encoding', 'utf-8',
            '--print', 'after_move:DOWNLOAD_PATH:%(filepath)s',
            url
        ]
        if shutil.which('node'):
            command[1:1] = ['--js-runtimes', 'node']
        if cookie_browser:
            command[1:1] = ['--cookies-from-browser', cookie_browser]

        log(f"Downloading audio from: {url}")
        log(f"Saving to: {output_path}")

        # Update progress
        if download_id:
            download_progress[download_id] = {
                'status': 'progress',
                'percent': 5,
                'message': f'Lettura sessione {cookie_browser.capitalize()}...' if cookie_browser else 'Recupero informazioni video...'
            }

        # Run yt-dlp with real-time output
        process = subprocess.Popen(
            command,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            encoding='utf-8',
            errors='replace',
            bufsize=1
        )

        file_paths = []
        recent_output = []
        for line in process.stdout:
            line = line.strip()
            log(line)
            if line:
                recent_output.append(line)
                recent_output = recent_output[-12:]
            if line.startswith('DOWNLOAD_PATH:'):
                file_paths.append(line.removeprefix('DOWNLOAD_PATH:'))

            # Parse progress from yt-dlp output
            if download_id:
                # Look for download progress lines like: [download]  45.2% of 3.21MiB
                if '[download] 100%' in line or re.search(r'\[download\]\s+100(?:\.0+)?%\s+of', line):
                    download_progress[download_id] = {
                        'status': 'converting',
                        'message': 'Download completato. Conversione MP3 in corso; i file lunghi richiedono tempo.'
                    }
                elif '[download]' in line and '%' in line and 'of' in line:
                    try:
                        # Extract percentage
                        percent_match = re.search(r'(\d+\.?\d*)%', line)
                        if percent_match:
                            percent = float(percent_match.group(1))
                            download_progress[download_id] = {
                                'status': 'progress',
                                'percent': min(int(percent * 0.75), 75),  # Cap at 75% for download
                                'message': f'Downloading... {int(percent)}%'
                            }
                    except (ValueError, AttributeError):
                        pass  # Ignore parsing errors

                elif any(keyword in line.lower() for keyword in ['extractaudio', 'post-process', 'converting', 'ffmpeg']):
                    download_progress[download_id] = {
                        'status': 'converting',
                        'message': 'Conversione MP3 in corso; i file lunghi richiedono tempo.'
                    }
                elif line.startswith('DOWNLOAD_PATH:'):
                    download_progress[download_id] = {
                        'status': 'progress',
                        'percent': 90,
                        'message': f'{len(file_paths)} brani pronti. Finalizzazione in corso...'
                    }

        # Wait for process to complete (with timeout for large files)
        try:
            process.wait(timeout=600)  # 10 minute timeout for very large files
        except subprocess.TimeoutExpired:
            process.kill()
            return {
                'success': False,
                'error': 'Download timeout - file too large or connection too slow'
            }

        if process.returncode != 0:
            error_msg = next((line for line in reversed(recent_output) if 'ERROR:' in line), None)
            error_msg = (error_msg or 'yt-dlp non è riuscito a scaricare questo video.').strip()[:500]
            log(f"Download failed: {error_msg}")
            return {
                'success': False,
                'error': error_msg
            }

        # yt-dlp reports each final path after audio conversion.
        valid_paths = [Path(path) for path in file_paths if Path(path).resolve().is_relative_to(Path(output_path).resolve()) and Path(path).is_file()]
        if valid_paths:
            filenames = [path.name for path in valid_paths]
            log(f"Downloaded: {len(filenames)} audio file(s)")
            return {
                'success': True,
                'filename': filenames[0],
                'filenames': filenames
            }
        return {
            'success': False,
            'error': 'yt-dlp non ha restituito il percorso del file MP3. Controlla la versione installata.'
        }

    except Exception as e:
        error_msg = str(e)
        log(f"Download error: {error_msg}")
        return {
            'success': False,
            'error': error_msg
        }


def load_config():
    """Load configuration from config.json"""
    config_path = Path(__file__).parent / 'config.json'

    if config_path.exists():
        with open(config_path) as f:
            config = json.load(f)
    else:
        config = {
            "music_folder": "./music",
            "port": 8765,
            "host": "127.0.0.1"
        }

    # Resolve music folder path
    music_folder = Path(config['music_folder'])
    if not music_folder.is_absolute():
        music_folder = (Path(__file__).parent / music_folder).resolve()

    # Create music folder if it doesn't exist
    music_folder.mkdir(parents=True, exist_ok=True)

    config['music_folder'] = str(music_folder)
    return config


def main():
    config = load_config()
    handler = lambda *args, **kwargs: MusicPlayerHandler(
        *args, music_folder=config['music_folder'], **kwargs
    )
    server = ThreadingHTTPServer(('127.0.0.1', 8765), handler)
    print('LetherelWorld: http://127.0.0.1:8765/', flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == '__main__':
    main()
