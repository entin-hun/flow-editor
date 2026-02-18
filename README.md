# Flow Editor

A BaklavaJS-based IDEF0 compliant flow/process editor with ReOwn Web3 authentication and contact collection.

## Features

- **Graph Editor**: Visual process and resource node editor with drag-and-drop interface
- **ReOwn Authentication**: Support for Email, Google, X, Discord, Farcaster, GitHub, Apple, Facebook login via Web3 AppKit
- **Auto-save**: Flows automatically saved to backend with user contact information
- **Contact Collection**: Mandatory email and phone number collection for each flow modification
- **Persistent Storage**: Flows stored on backend with owner tracking and last-updated-by recording
- **Responsive Design**: Works on desktop and mobile devices
- **Shareable Links**: Flows accessible via `/s/:flowId` shareable URLs

## Project Structure

```
flow-editor/
├── src/
│   ├── App.vue                 # Main application component
│   ├── components/
│   │   ├── Idef0Node.vue       # IDEF0 Process node component
│   │   └── ResourceNode.vue    # Resource/Material node component
│   ├── nodes/
│   │   ├── ProcessNode.ts      # ProcessNode class with i/o/c/m ports
│   │   └── ResourceNode.ts     # ResourceNode class with resource types
│   ├── services/
│   │   └── reownAppkit.ts      # ReOwn auth service
│   └── style.css               # Global styles
├── server/
│   ├── src/
│   │   └── index.ts            # Express backend API
│   └── package.json
├── index.html                  # Entry point
├── package.json                # Frontend dependencies
└── vite.config.ts              # Vite configuration

```

## Local Development Setup

### Prerequisites

- Node.js 18+ and npm/pnpm
- ReOwn project ID (get from https://cloud.reown.com)

### Installation

```bash
# Install frontend dependencies
npm install

# Install backend dependencies
cd server
npm install
cd ..

# Create .env file with ReOwn configuration
cat > .env << EOF
VITE_REOWN_PROJECT_ID=your_project_id_here
VITE_FLOW_API_BASE=http://localhost:5175
EOF
```

### Running Locally

**Terminal 1 - Backend (Express, Port 5175):**
```bash
cd server
npm run dev
```

**Terminal 2 - Frontend (Vite, Port 5174):**
```bash
npm run dev
```

The app will be available at `http://localhost:5174`

## Backend API

The backend provides a RESTful API for flow storage and retrieval.

### Endpoints

#### POST /api/flows
Create a new flow.

**Request:**
```json
{
  "version": 1,
  "graph": { ... },
  "nodes": [ ... ],
  "view": { "scaling": 1, "panning": { "x": 0, "y": 0 } },
  "contact": { "email": "user@example.com", "phone": "+1234567890" },
  "updatedAt": "2024-01-01T00:00:00.000Z"
}
```

**Headers:**
```
Authorization: Bearer <auth_token>
Content-Type: application/json
```

**Response:**
```json
{
  "id": "flow_abc123def456",
  "owner": "sha256_hash_of_token",
  "lastUpdatedBy": "user@example.com",
  "createdAt": "2024-01-01T00:00:00.000Z",
  ...payload
}
```

#### GET /api/flows/:id
Retrieve a flow by ID.

**Response:**
```json
{
  "id": "flow_abc123def456",
  "owner": "sha256_hash_of_token",
  "lastUpdatedBy": "user@example.com",
  ... full payload
}
```

#### PUT /api/flows/:id
Update an existing flow.

**Request:** Same as POST
**Headers:** Same as POST
**Response:** Updated flow object

### Backend Environment Variables

Create a `.env` file in the `server/` directory:

```bash
# Port for the Express server (default: 5175)
PORT=5175

# Directory for storing flow JSON files (default: ./data/flows)
FLOW_STORAGE_DIR=./data/flows

# CORS origin (default: http://localhost:5174)
CORS_ORIGIN=http://localhost:5174
```

### Folder Structure

Backend creates the following folder structure:
```
server/
├── data/
│   └── flows/
│       └── flow_abc123def456.json    # Individual flow files
├── node_modules/
├── src/
│   └── index.ts
└── package.json
```

## Flow Data Structure

All flows are stored as JSON with the following schema:

```json
{
  "version": 1,
  "graph": {
    "nodes": [...],
    "connections": [...]
  },
  "nodes": [
    {
      "id": "node_id",
      "type": "ProcessNode|ResourceNode",
      "title": "Node Title",
      "position": { "x": 100, "y": 200 },
      "resourceType": "input|output|machine|energy|gas|water|service|property",
      "fields": { ... },
      "details": "Additional details"
    }
  ],
  "view": {
    "scaling": 1.5,
    "panning": { "x": 50, "y": 100 }
  },
  "contact": {
    "email": "user@example.com",
    "phone": "+1234567890"
  },
  "updatedAt": "2024-01-01T00:00:00.000Z",
  "owner": "sha256_hash_of_token",
  "lastUpdatedBy": "user@example.com"
}
```

## ReOwn Configuration

### Setting Up ReOwn Project

1. Go to https://cloud.reown.com and create a new project
2. Copy your **Project ID**
3. Add to `.env`:
   ```
   VITE_REOWN_PROJECT_ID=your_project_id
   ```

### Supported Authentication Providers

The following social login providers are available:
- **Email**: Default email/password login
- **Google**: OAuth via Google
- **X (Twitter)**: OAuth via X
- **Discord**: OAuth via Discord
- **Farcaster**: Farcaster Frame signin
- **GitHub**: OAuth via GitHub
- **Apple**: Sign in with Apple
- **Facebook**: OAuth via Facebook

Configure which providers to enable in the ReOwn dashboard.

## VPS Deployment

### Prerequisites

- Ubuntu/Debian server with Node.js 18+ installed
- Domain name (e.g., flow-editor.example.com)
- Nginx or Apache reverse proxy (optional but recommended)

### Deployment Steps

1. **Clone and install:**
   ```bash
   cd /opt/
   git clone https://github.com/your-org/flow-editor.git
   cd flow-editor
   npm install
   cd server && npm install && cd ..
   ```

2. **Build frontend:**
   ```bash
   npm run build
   ```

3. **Create backend service file:**
   ```bash
   sudo tee /etc/systemd/system/flow-editor-server.service << EOF
   [Unit]
   Description=Flow Editor Backend Server
   After=network.target

   [Service]
   Type=simple
   User=www-data
   WorkingDirectory=/opt/flow-editor/server
   ExecStart=/usr/bin/node dist/index.js
   Restart=on-failure
   RestartSec=10
   Environment="NODE_ENV=production"
   Environment="PORT=5175"
   Environment="FLOW_STORAGE_DIR=/var/lib/flow-editor/flows"
   Environment="CORS_ORIGIN=https://flow-editor.example.com"

   [Install]
   WantedBy=multi-user.target
   EOF
   ```

4. **Create backend frontend service file:**
   ```bash
   sudo tee /etc/systemd/system/flow-editor-frontend.service << EOF
   [Unit]
   Description=Flow Editor Frontend (Static Files)
   After=network.target

   [Service]
   Type=simple
   User=www-data
   WorkingDirectory=/opt/flow-editor
   ExecStart=/usr/bin/python3 -m http.server 5174 --directory dist
   Restart=on-failure
   RestartSec=10

   [Install]
   WantedBy=multi-user.target
   EOF
   ```

5. **Build backend and create data directories:**
   ```bash
   cd server && npm run build && cd ..
   sudo mkdir -p /var/lib/flow-editor/flows
   sudo chown www-data:www-data /var/lib/flow-editor
   sudo chmod 755 /var/lib/flow-editor
   ```

6. **Enable and start services:**
   ```bash
   sudo systemctl daemon-reload
   sudo systemctl enable flow-editor-server
   sudo systemctl enable flow-editor-frontend
   sudo systemctl start flow-editor-server
   sudo systemctl start flow-editor-frontend
   ```

7. **Configure Nginx reverse proxy:**
   ```bash
   sudo tee /etc/nginx/sites-available/flow-editor << EOF
   server {
       listen 80;
       server_name flow-editor.example.com;

       # Frontend static files
       location / {
           proxy_pass http://localhost:5174;
           proxy_http_version 1.1;
           proxy_set_header Upgrade \$http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host \$host;
           proxy_cache_bypass \$http_upgrade;
       }

       # Backend API
       location /api/ {
           proxy_pass http://localhost:5175;
           proxy_http_version 1.1;
           proxy_set_header Host \$host;
           proxy_set_header X-Real-IP \$remote_addr;
           proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
           proxy_set_header X-Forwarded-Proto \$scheme;
       }
   }
   EOF
   ```

8. **Enable Nginx site and restart:**
   ```bash
   sudo ln -s /etc/nginx/sites-available/flow-editor /etc/nginx/sites-enabled/
   sudo nginx -t
   sudo systemctl restart nginx
   ```

9. **Update frontend configuration:**
   Create `.env` on VPS:
   ```
   VITE_REOWN_PROJECT_ID=your_project_id
   VITE_FLOW_API_BASE=https://flow-editor.example.com
   ```

   Rebuild and redeploy:
   ```bash
   npm run build
   sudo cp -r dist/* /opt/flow-editor/dist/
   ```

### Monitoring

Check service status:
```bash
sudo systemctl status flow-editor-server
sudo systemctl status flow-editor-frontend
```

View logs:
```bash
sudo journalctl -u flow-editor-server -f
sudo journalctl -u flow-editor-frontend -f
```

## Development Notes

### Node Types

**ProcessNode** (IDEF0 Activity)
- 4 standard input ports: Material (I), Mechanism (M), Controls (C), Input (I)
- 2 standard output ports: Output (O), Feedback (F)
- Title and optional details text

**ResourceNode** (Material/Equipment/Energy)
- Single input and output port
- Resource types: input, output, machine, energy, gas, water, service, property
- Icon representation based on resource type

### Auto-layout Algorithm

The graph uses a hierarchical auto-layout that minimizes:
- Connection line crossings
- Line length
- Whitespace

Manual positioning is preserved when `suppressAutoArrange` is active during payload application.

### Contact Field Storage

Contact fields (email, phone) are:
1. Validated when Save is clicked
2. Included in flow payload JSON
3. Persisted to backend
4. Restored when loading flows from backend
5. Auto-filled from ReOwn email on authentication

## Troubleshooting

### "Phone is required" error
Make sure to fill in both phone and email before clicking Save.

### "Email is required" error
Log in with ReOwn to auto-fill email, or enter manually in the contact field.

### Contact fields lost after refresh
Contact data is stored in the flow payload on backend. After login and saving, refresh the page to reload flow with contact data.

### ReOwn modal doesn't open
Check that:
- `VITE_REOWN_PROJECT_ID` is set in `.env`
- Project ID is valid in ReOwn dashboard
- Social login providers are configured in ReOwn dashboard

### Connection lines not visible
- Try zooming in/out
- Check that nodes are connected (look for ports)
- Refresh page to redraw connections

## Support

For issues or questions, refer to:
- [BaklavaJS Docs](https://github.com/newcat/baklavajs)
- [ReOwn AppKit Docs](https://docs.reown.com)
- [Vue 3 Docs](https://vuejs.org)
