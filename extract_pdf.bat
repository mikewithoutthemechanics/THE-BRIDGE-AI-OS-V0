@echo off
REM Script to extract text from PDF using Python and PyPDF2
REM Requires Python to be installed

echo Installing PyPDF2...
pip install PyPDF2 --quiet

echo Extracting text from PDF...
python -c "
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
        print('First 500 characters:')
        print(text[:500])
        
except Exception as e:
    print(f'Error: {e}')
    sys.exit(1)
"

echo.
echo Text extraction complete. The content has been saved to:
echo C:\Users\supas\Downloads\god_mode_prompts.txt
echo.
echo You can now read this file to see the extracted content.