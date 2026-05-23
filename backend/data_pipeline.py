import os
import pandas as pd
from langchain_community.document_loaders import PyPDFLoader, CSVLoader, TextLoader, DataFrameLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_community.vectorstores import Chroma
from dotenv import load_dotenv
from embeddings import get_embeddings

load_dotenv()

def ingest_knowledge_base(data_dir="../data/knowledge", chroma_dir="../data/chroma_db", mock_csv="../mock_dataset.csv", clear_existing=False):
    print("Initializing ChromaDB ingestion...")
    
    if clear_existing and os.path.exists(chroma_dir):
        print("Clearing existing ChromaDB...")
        import shutil
        shutil.rmtree(chroma_dir)
        
    # 1. Setup Embeddings
    embeddings = get_embeddings()
    
    # 2. Setup Chroma
    vectorstore = Chroma(
        collection_name="hallmarking_knowledge",
        embedding_function=embeddings,
        persist_directory=chroma_dir
    )
    
    documents = []
    
    # 3. Load files from /data/knowledge/
    if os.path.exists(data_dir):
        print(f"Loading files from {data_dir}...")
        for file in os.listdir(data_dir):
            file_path = os.path.join(data_dir, file)
            try:
                if file.endswith('.pdf'):
                    loader = PyPDFLoader(file_path)
                    documents.extend(loader.load())
                elif file.endswith('.csv'):
                    loader = CSVLoader(file_path)
                    documents.extend(loader.load())
                elif file.endswith('.txt'):
                    loader = TextLoader(file_path)
                    documents.extend(loader.load())
            except Exception as e:
                print(f"Error loading {file}: {e}")
    else:
        print(f"Directory {data_dir} not found. Creating it...")
        os.makedirs(data_dir, exist_ok=True)
        
    # 4. Also ingest mock_dataset.csv from project root
    if os.path.exists(mock_csv):
        print(f"Loading mock dataset from {mock_csv}...")
        try:
            df = pd.read_csv(mock_csv)
            if 'Question' in df.columns and 'Answer' in df.columns:
                df['text'] = "Q: " + df['Question'] + "\nA: " + df['Answer']
                loader = DataFrameLoader(df, page_content_column="text")
                documents.extend(loader.load())
            else:
                loader = CSVLoader(mock_csv)
                documents.extend(loader.load())
        except Exception as e:
            print(f"Error loading mock dataset: {e}")
            
    if not documents:
        print("No documents found to ingest.")
        return
        
    # 5. Chunk documents
    print(f"Chunking {len(documents)} documents...")
    text_splitter = RecursiveCharacterTextSplitter(chunk_size=500, chunk_overlap=50)
    chunks = text_splitter.split_documents(documents)
    
    # 6. Add to Chroma
    print(f"Adding {len(chunks)} chunks to ChromaDB...")
    vectorstore.add_documents(chunks)
    print("Successfully ingested documents into ChromaDB.")

if __name__ == "__main__":
    # Ensure directories exist
    os.makedirs("../data/knowledge", exist_ok=True)
    
    # Create dummy mock_dataset.csv if not exists
    if not os.path.exists("../mock_dataset.csv"):
        df = pd.DataFrame({
            "Question": ["What is XRF?", "How to register for BIS?", "What is the gold rate?"],
            "Answer": ["XRF is a non-destructive testing method to determine gold purity.", "Visit the BIS official portal and submit Form 1.", "The gold rate fluctuates daily. Please check the public API."]
        })
        df.to_csv("../mock_dataset.csv", index=False)
        
    ingest_knowledge_base()
