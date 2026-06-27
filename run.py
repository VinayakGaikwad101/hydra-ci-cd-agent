import os
import sys
import time
import subprocess
import webbrowser

def print_banner():
    banner = """
========================================================================
             HYDRA: Autonomous Self-Healing CI/CD Agent
========================================================================
    A Next.js full-stack platform coordinating specialized AI agents
    to autonomously fix failing codebases inside sandboxed runtimes.
========================================================================
    """
    print(banner)

def main():
    print_banner()
    
    # 1. Install packages if node_modules doesn't exist
    if not os.path.exists('node_modules'):
        print("[*] node_modules not found. Installing packages...")
        try:
            subprocess.run("npm install", shell=True, check=True)
            print("[OK] Packages installed successfully.")
        except Exception as e:
            print(f"[ERROR] Error installing node modules: {e}")
            sys.exit(1)
            
    # 2. Check for Gemini Key
    gemini_key = os.environ.get('GEMINI_API_KEY')
    if not gemini_key:
        print("[!] Warning: GEMINI_API_KEY environment variable is not set.")
        print("    You can still run in Simulation Mode, but to run live fixes,")
        print("    please set your key in .env.local or enter it in the UI settings.")
        print()
    else:
        print("[OK] GEMINI_API_KEY environment variable detected.")

    # 3. Create temp workspaces folder
    os.makedirs('temp-workspaces', exist_ok=True)
    
    # 4. Start Next.js Development Server
    print("[*] Booting Next.js development server...")
    try:
        # Run npm run dev
        process = subprocess.Popen("npm run dev", shell=True)
        
        # Give next.js dev server 3 seconds to spin up
        time.sleep(3)
        
        # 5. Open browser
        url = "http://localhost:3000"
        print(f"[OK] Server started! Opening dashboard in browser: {url}")
        webbrowser.open(url)
        
        # Keep python running to allow terminal output monitoring
        process.wait()
    except KeyboardInterrupt:
        print("\n[!] Shutting down development server...")
    except Exception as e:
        print(f"[ERROR] Failed to launch server: {e}")

if __name__ == "__main__":
    main()
