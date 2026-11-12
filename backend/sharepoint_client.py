import os
import requests


# ==================================
# SharePoint Config (from .env)
# ==================================

TENANT_ID = os.getenv("SHAREPOINT_TENANT_ID", "")
CLIENT_ID = os.getenv("SHAREPOINT_CLIENT_ID", "")
CLIENT_SECRET = os.getenv("SHAREPOINT_CLIENT_SECRET", "")
SITE_URL = os.getenv("SHAREPOINT_SITE_URL", "")


# ==================================
# Check if SharePoint is Configured
# ==================================

def is_configured():
    """Return True only if all SharePoint credentials are set."""
    return all([TENANT_ID, CLIENT_ID, CLIENT_SECRET, SITE_URL])


# ==================================
# Get Access Token (OAuth2)
# ==================================

def get_access_token():
    """
    Get Microsoft Graph API access token using client credentials flow.
    Requires: SHAREPOINT_TENANT_ID, SHAREPOINT_CLIENT_ID,
              SHAREPOINT_CLIENT_SECRET, SHAREPOINT_SITE_URL in .env
    """

    if not is_configured():
        raise ValueError(
            "SharePoint credentials not configured. "
            "Please set SHAREPOINT_TENANT_ID, SHAREPOINT_CLIENT_ID, "
            "SHAREPOINT_CLIENT_SECRET, and SHAREPOINT_SITE_URL in your .env file."
        )

    token_url = (
        f"https://login.microsoftonline.com/{TENANT_ID}/oauth2/v2.0/token"
    )

    payload = {
        "grant_type": "client_credentials",
        "client_id": CLIENT_ID,
        "client_secret": CLIENT_SECRET,
        "scope": "https://graph.microsoft.com/.default"
    }

    response = requests.post(token_url, data=payload, timeout=15)
    response.raise_for_status()

    return response.json()["access_token"]


# ==================================
# Get SharePoint Site ID
# ==================================

def get_site_id(token):
    """Resolve the SharePoint site URL to a Graph API site ID."""

    url_parts = SITE_URL.replace("https://", "").split("/", 1)
    hostname = url_parts[0]
    site_path = url_parts[1] if len(url_parts) > 1 else ""

    api_url = f"https://graph.microsoft.com/v1.0/sites/{hostname}:/{site_path}"

    headers = {"Authorization": f"Bearer {token}"}
    response = requests.get(api_url, headers=headers, timeout=15)
    response.raise_for_status()

    return response.json()["id"]


# ==================================
# List Documents
# ==================================

def list_documents():
    """
    Fetch list of documents from SharePoint document library.
    Returns list of dicts: id, name, size, last_modified, web_url
    """

    token = get_access_token()
    site_id = get_site_id(token)
    headers = {"Authorization": f"Bearer {token}"}

    drive_url = (
        f"https://graph.microsoft.com/v1.0/sites/{site_id}/drive/root/children"
        f"?$select=id,name,size,lastModifiedDateTime,webUrl,file&$top=50"
    )

    response = requests.get(drive_url, headers=headers, timeout=15)
    response.raise_for_status()

    items = response.json().get("value", [])
    documents = []

    for item in items:
        if "file" in item:
            name = item.get("name", "")
            if any(
                name.lower().endswith(ext)
                for ext in [".pdf", ".docx", ".doc", ".txt", ".pptx"]
            ):
                documents.append({
                    "id": item["id"],
                    "name": name,
                    "size": item.get("size", 0),
                    "last_modified": item.get("lastModifiedDateTime", ""),
                    "web_url": item.get("webUrl", ""),
                    "mime_type": item.get("file", {}).get("mimeType", "")
                })

    return documents


# ==================================
# Download Document
# ==================================

def download_document(doc_id):
    """
    Download a document from SharePoint by its Graph API item ID.
    Returns (filename, file_bytes).
    """

    token = get_access_token()
    site_id = get_site_id(token)
    headers = {"Authorization": f"Bearer {token}"}

    meta_url = (
        f"https://graph.microsoft.com/v1.0/sites/{site_id}/drive/items/{doc_id}"
    )

    meta_resp = requests.get(meta_url, headers=headers, timeout=15)
    meta_resp.raise_for_status()

    meta = meta_resp.json()
    filename = meta.get("name", "sharepoint_doc.pdf")
    download_url = meta.get("@microsoft.graph.downloadUrl")

    if not download_url:
        raise ValueError(f"No download URL for document {doc_id}")

    file_resp = requests.get(download_url, timeout=30)
    file_resp.raise_for_status()

    return filename, file_resp.content
