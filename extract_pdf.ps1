$pythonPath = "C:\Users\supas\AppData\Local\Programs\Python\Python312\python.exe"

Write-Host "Installing PyPDF2..."
& $pythonPath -m pip install PyPDF2 --quiet

Write-Host "Extracting text from PDF..."
& $pythonPath -c "
import PyPDF2
import sys

try:
    with open(r'C:\Users\supas\Downloads\ChatGPT - God Mode Prompt Engine.pdf', 'rb') as file:
        reader = PyPDF2.PdfReader(file)
        text = ''
        for page in reader.pages:
            text += page.extract_text() + '\n'
        
        # Save to text file
        with open(r'C:\Users\supas\Downloads\god_mode_prompts.txt', 'w', encoding='utf-8') as out_file:
            out_file.write(text)
        
        print(f'Extracted {len(text)} characters to god_mode_prompts.txt')
        print('First 1000 characters:')
        print(text[:1000])
        
except Exception as e:
    print(f'Error: {e}')
    sys.exit(1)
"

Write-Host ""
Write-Host "Text extraction complete. The content has been saved to:"
Write-Host "C:\Users\supas\Downloads\god_mode_prompts.txt"