import pandas as pd
from langchain_community.document_loaders import DataFrameLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_openai import OpenAIEmbeddings
from langchain_community.vectorstores import FAISS
from dotenv import load_dotenv
import os

load_dotenv()

def ingest_data(file_path="mock_dataset.csv", index_path="faiss_index"):
    if not os.path.exists(file_path):
        print(f"Error: {file_path} not found.")
        return

    # 1. Load data
    print(f"Loading data from {file_path}...")
    df = pd.read_csv(file_path)
    # Combine Question and Answer for context
    df['text'] = "Q: " + df['Question'] + "\nA: " + df['Answer']
    
    loader = DataFrameLoader(df, page_content_column="text")
    documents = loader.load()

    # 2. Chunk text
    print("Chunking text...")
    text_splitter = RecursiveCharacterTextSplitter(chunk_size=500, chunk_overlap=50)
    chunks = text_splitter.split_documents(documents)

    # 3. Create Embeddings & Store in FAISS
    print("Generating embeddings and building FAISS index...")
    # Requires OPENAI_API_KEY in .env
    embeddings = OpenAIEmbeddings(model="text-embedding-ada-002")
    vectorstore = FAISS.from_documents(chunks, embeddings)

    # 4. Save to disk
    vectorstore.save_local(index_path)
    print(f"Successfully saved FAISS index to '{index_path}' directory.")

if __name__ == "__main__":
    ingest_data()
