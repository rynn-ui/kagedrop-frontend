import os
import uuid
import asyncio
import shutil
from typing import Dict, List
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, UploadFile, File, BackgroundTasks, Form
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()

def generate_anime_identity():
    """Simple fallback identity if Jikan fails or is bypassed."""
    return {"name": "Mystery Shinobi", "icon": "https://i.pinimg.com/originals/ba/92/7f/ba927ff34cd961ce2cff403d13e170f3.jpg"}


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


UPLOAD_DIR = "uploads"
if not os.path.exists(UPLOAD_DIR):
    os.makedirs(UPLOAD_DIR)


class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, WebSocket] = {}
        self.device_info: Dict[str, dict] = {}

    async def connect(self, websocket: WebSocket, client_id: str, identity: dict = None):
        await websocket.accept()
        if not identity:
            identity = generate_anime_identity()
        self.active_connections[client_id] = websocket
        self.device_info[client_id] = {
            "id": client_id,
            "name": identity["name"],
            "icon": identity["icon"]
        }
        
        await self.broadcast_device_list()

    def disconnect(self, client_id: str):
        if client_id in self.active_connections:
            del self.active_connections[client_id]
        if client_id in self.device_info:
            del self.device_info[client_id]

    async def broadcast_device_list(self):
        devices = list(self.device_info.values())
        for client_id, connection in self.active_connections.items():
            try:
                # Send everyone the list, filtering out themselves on the frontend
                await connection.send_json({
                    "type": "device_list",
                    "devices": devices,
                    "your_id": client_id
                })
            except:
                pass

    async def send_personal_message(self, message: dict, client_id: str):
        if client_id in self.active_connections:
            await self.active_connections[client_id].send_json(message)

manager = ConnectionManager()


async def cleanup_file(file_path: str, delay: int = 300):
    await asyncio.sleep(delay)
    if os.path.exists(file_path):
        os.remove(file_path)

@app.websocket("/ws/{client_id}")
async def websocket_endpoint(websocket: WebSocket, client_id: str):
    await manager.connect(websocket, client_id)
    try:
        while True:
            data = await websocket.receive_json()
            
            if data["type"] == "set_identity":
                identity = data.get("identity")
                if identity:
                    manager.device_info[client_id].update({
                        "name": identity["name"],
                        "icon": identity["icon"]
                    })
                    await manager.broadcast_device_list()

            elif data["type"] == "file_offer":
                target_id = data["target_id"]
                await manager.send_personal_message({
                    "type": "file_offer",
                    "from": manager.device_info[client_id],
                    "file_info": data["file_info"],
                    "transfer_id": data["transfer_id"],
                    "encryption_key": data.get("encryption_key")
                }, target_id)
            
            elif data["type"] == "accept_transfer":
                target_id = data["target_id"]
                await manager.send_personal_message({
                    "type": "transfer_accepted",
                    "transfer_id": data["transfer_id"]
                }, target_id)

    except WebSocketDisconnect:
        manager.disconnect(client_id)
        await manager.broadcast_device_list()

@app.post("/upload")
async def upload_file(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    target_id: str = Form(None),
    transfer_id: str = Form(None)
):
    file_id = str(uuid.uuid4())
    file_path = os.path.join(UPLOAD_DIR, f"{file_id}_{file.filename}")
    
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    
    
    background_tasks.add_task(cleanup_file, file_path)
    
    
    if target_id and transfer_id:
        await manager.send_personal_message({
            "type": "file_ready",
            "file_url": f"/download/{file_id}",
            "filename": file.filename,
            "transfer_id": transfer_id
        }, target_id)
        
    return {"status": "success", "file_id": file_id}

@app.get("/download/{file_id}")
async def download_file(file_id: str):
    
    for filename in os.listdir(UPLOAD_DIR):
        if filename.startswith(file_id):
            file_path = os.path.join(UPLOAD_DIR, filename)
            actual_filename = filename[len(file_id)+1:]
            return FileResponse(
                path=file_path,
                filename=actual_filename,
                media_type='application/octet-stream'
            )
    return JSONResponse(status_code=404, content={"message": "File not found or expired"})


app.mount("/", StaticFiles(directory="frontend", html=True), name="frontend")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
