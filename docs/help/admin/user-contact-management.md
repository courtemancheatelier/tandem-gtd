---
title: User Contact Management
category: Admin
tags: [admin, users, contact, profile, emergency contact, phone]
sortOrder: 5
adminOnly: true
---

# User Contact Management

Admins can view and update contact information for any user in the system, including core account details and volunteer profile fields.

## Editing User Contact Info

1. Go to **Settings > Admin > Users**
2. Expand the **User Management** section
3. Click **Edit** on any user
4. The **Contact Information** section appears at the top of the dialog

## Editable Fields

### Account Fields
| Field | Notes |
|-------|-------|
| **Name** | User's display name |
| **Email** | Must be unique across all users. Changing email may affect OAuth login if the user signs in with Google/Apple. |

### Volunteer Profile Fields
| Field | Notes |
|-------|-------|
| **Phone** | Primary contact number |
| **Address** | Street address, city, state |
| **Emergency Contact** | Name of emergency contact person |
| **Emergency Phone** | Emergency contact phone number |

## How It Works

- Account fields (name, email) are saved to the user record
- Volunteer profile fields are saved to the volunteer profile, which is auto-created if it doesn't exist
- Both are saved simultaneously when you click **Save Changes**
- The volunteer profile is fetched each time you open the edit dialog to ensure current data

## Important Notes

- **Email changes**: If a user signs in via Google OAuth, changing their email in Tandem does not change their Google account. They will still sign in with their original Google email, but their display email in Tandem will differ.
- **Data privacy**: Contact information including phone, address, and emergency contacts should be handled according to your organization's data privacy policies.
- **Self-edit**: Users can also edit their own name via Settings > Profile. Admins can edit any user's information.
