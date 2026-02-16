#!/usr/bin/env python3
"""
Blogger API OAuth2 Authentication and Posting Script
"""

import os
import json
import pickle
from google_auth_oauthlib.flow import InstalledAppFlow
from google.auth.transport.requests import Request
from googleapiclient.discovery import build

# Blogger API scope
SCOPES = ['https://www.googleapis.com/auth/blogger']

def get_credentials():
    """Get valid user credentials from storage or run OAuth flow."""
    creds = None
    token_path = 'token.pickle'

    # Load existing token if available
    if os.path.exists(token_path):
        with open(token_path, 'rb') as token:
            creds = pickle.load(token)

    # If no valid credentials, authenticate
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            flow = InstalledAppFlow.from_client_secrets_file(
                'credentials.json', SCOPES)
            creds = flow.run_local_server(port=0)

        # Save credentials for future use
        with open(token_path, 'wb') as token:
            pickle.dump(creds, token)

    return creds

def get_blog_id(service, blog_url):
    """Get blog ID from blog URL."""
    try:
        # Try to get blog by URL
        response = service.blogs().getByUrl(url=f'http://{blog_url}').execute()
        return response['id']
    except Exception as e:
        print(f"Error getting blog ID: {e}")
        return None

def create_post(service, blog_id, title, content):
    """Create a new blog post."""
    post = {
        'kind': 'blogger#post',
        'title': title,
        'content': content
    }

    try:
        result = service.posts().insert(blogId=blog_id, body=post).execute()
        return result
    except Exception as e:
        print(f"Error creating post: {e}")
        return None

def main():
    """Main function to test authentication and get blog ID."""
    creds = get_credentials()
    service = build('blogger', 'v3', credentials=creds)

    # Get blog ID
    blog_url = 'wandhealth.blogspot.com'
    blog_id = get_blog_id(service, blog_url)

    if blog_id:
        print(f"Successfully authenticated!")
        print(f"Blog ID: {blog_id}")
        print(f"Blog URL: {blog_url}")

        # Save blog ID for future use
        with open('blog_config.json', 'w') as f:
            json.dump({
                'blog_id': blog_id,
                'blog_url': blog_url
            }, f, indent=2)
        print("Saved blog configuration to blog_config.json")
    else:
        print("Failed to get blog ID")

if __name__ == '__main__':
    main()
