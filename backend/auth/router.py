"""
WeatherGPT — Auth Module
Routes: /api/v1/auth/*
Handles user registration, login, JWT token management, and role-based access.
"""

from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, HTTPException, Depends, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, Field, EmailStr, field_validator
import logging
import re
import bcrypt
from jose import JWTError, jwt

from config import settings
from database import get_supabase
from security.validation import RegisterRequest, LoginRequest

logger = logging.getLogger("auth")

router = APIRouter(prefix="/auth", tags=["auth"])

# ── Password hashing ──────────────────────────────────────────────────────────
security = HTTPBearer()


def hash_password(password: str) -> str:
    """Hash a password using bcrypt with high work factor."""
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt(rounds=12)).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    """Verify a password against its bcrypt hash."""
    return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))


# ── JWT helpers ───────────────────────────────────────────────────────────────
def create_access_token(user_id: str, role: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(
        minutes=settings.jwt_expire_minutes
    )
    payload = {"sub": user_id, "role": role, "exp": expire}
    return jwt.encode(
        payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm
    )


def decode_token(token: str) -> dict:
    try:
        return jwt.decode(
            token,
            settings.jwt_secret_key,
            algorithms=[settings.jwt_algorithm],
        )
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )


# ── Dependencies ──────────────────────────────────────────────────────────────
async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> dict:
    """Extract and validate JWT, return the user row from the database."""
    payload = decode_token(credentials.credentials)
    db = get_supabase()
    result = (
        db.table("users")
        .select("id, name, email, role, phone_number, phone_verified, whatsapp_consent, created_at")
        .eq("id", payload["sub"])
        .single()
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="User not found")
    return result.data


async def require_admin(user: dict = Depends(get_current_user)) -> dict:
    """Dependency that requires the current user to have the admin role."""
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return user


# Request/Response schemas imported from security.validation


# ── Routes ────────────────────────────────────────────────────────────────────
@router.post("/register", status_code=201)
async def register(body: RegisterRequest):
    """Create a new user account."""
    db = get_supabase()

    # Check duplicate email
    existing = db.table("users").select("id").eq("email", body.email).execute()
    if existing.data:
        raise HTTPException(status_code=409, detail="Email already registered")

    # Password strength is validated by Pydantic schema (8+ chars, complexity)

    user_row = {
        "name": body.name,
        "email": body.email.lower().strip(),
        "password_hash": hash_password(body.password),
        "role": "user",
    }
    result = db.table("users").insert(user_row).execute()
    user = result.data[0]

    # Create default notification preferences
    db.table("notification_preferences").insert({"user_id": user["id"]}).execute()

    logger.info(f"New user registered: {user['email']}")
    return {"id": user["id"], "name": user["name"], "email": user["email"]}


@router.post("/login")
async def login(body: LoginRequest):
    """Authenticate and return a JWT token."""
    db = get_supabase()
    result = (
        db.table("users")
        .select("id, name, email, password_hash, role")
        .eq("email", body.email)
        .execute()
    )

    if not result.data:
        # Use same error for both missing user and wrong password
        # to prevent email enumeration
        raise HTTPException(status_code=401, detail="Invalid email or password")

    user = result.data[0]
    if not verify_password(body.password, user["password_hash"]):
        logger.warning(f"Failed login attempt for: {body.email.lower().strip()}")
        raise HTTPException(status_code=401, detail="Invalid email or password")

    token = create_access_token(user["id"], user["role"])
    return {
        "token": token,
        "user": {
            "id": user["id"],
            "name": user["name"],
            "email": user["email"],
            "role": user["role"],
            "created_at": user.get("created_at"),
            "whatsapp_consent": user.get("whatsapp_consent"),
        },
    }


@router.post("/logout")
async def logout(user: dict = Depends(get_current_user)):
    """Logout — stateless JWT, client discards the token."""
    return {"message": "Logged out"}


@router.get("/me")
async def me(user: dict = Depends(get_current_user)):
    """Return the current authenticated user's profile."""
    return user


# ── Password Reset ───────────────────────────────────────────────────────────

def _generate_reset_token() -> str:
    """Generate a cryptographically secure random token."""
    import secrets
    import hashlib
    return secrets.token_urlsafe(48)


def _hash_token(token: str) -> str:
    """Hash a token with SHA-256 for safe storage."""
    import hashlib
    return hashlib.sha256(token.encode()).hexdigest()


def _smtp_send_blocking(to: str, subject: str, html: str) -> bool:
    """Blocking SMTP send (runs in a worker thread — never blocks the event loop)."""
    import smtplib
    from email.mime.text import MIMEText
    from email.mime.multipart import MIMEMultipart

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = f"{settings.smtp_from_name} <{settings.smtp_user}>"
    msg["To"] = to
    msg["Reply-To"] = settings.smtp_user
    msg.attach(MIMEText(html, "html"))

    last_error: Exception | None = None
    # One retry: transient network/SMTP hiccups are the #1 cause of "no email".
    for attempt in (1, 2):
        try:
            with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=15) as server:
                server.ehlo()
                server.starttls()
                server.ehlo()
                server.login(settings.smtp_user, settings.smtp_password)
                server.send_message(msg)
            logger.info(f"Email sent to: {to} ({subject})")
            return True
        except Exception as e:  # noqa: BLE001
            last_error = e
            logger.error(
                f"SMTP attempt {attempt} failed for {to}: {type(e).__name__}: {e}"
            )
            if attempt == 1:
                import time
                time.sleep(1.5)  # brief backoff before retry (sync context — thread)
    logger.error(f"SMTP send FAILED permanently for {to}: {last_error}")
    return False


async def _send_email(to: str, subject: str, html: str) -> bool:
    """Send an HTML email via SMTP (off the event loop). Returns True on success."""
    import asyncio
    return await asyncio.to_thread(_smtp_send_blocking, to, subject, html)


def _reset_email_html(user_name: str, reset_url: str, expire_min: int) -> str:
    """Build the styled HTML for password reset emails."""
    return f"""
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"></head>
    <body style="margin:0;padding:0;background:#0A1128;font-family:'Segoe UI',system-ui,sans-serif;">
      <div style="max-width:480px;margin:40px auto;background:#111827;border-radius:16px;border:1px solid #2A3450;overflow:hidden;">
        <div style="padding:32px;text-align:center;">
          <div style="width:56px;height:56px;border-radius:14px;background:linear-gradient(135deg,#4FD1C5,#3D9CFF);margin:0 auto 20px;display:flex;align-items:center;justify-content:center;font-size:24px;">
            🌦️
          </div>
          <h1 style="color:#EAF2F8;font-size:20px;font-weight:700;margin:0 0 8px;">Password Reset</h1>
          <p style="color:#718096;font-size:14px;margin:0 0 24px;">Hi {user_name}, we received a request to reset your password.</p>
          
          <a href="{reset_url}" style="display:inline-block;padding:14px 32px;background:linear-gradient(135deg,#4FD1C5,#3D9CFF);color:#fff;font-size:14px;font-weight:600;text-decoration:none;border-radius:10px;margin-bottom:20px;">
            Reset My Password
          </a>
          
          <p style="color:#718096;font-size:12px;margin:0 0 8px;">This link expires in <strong style="color:#FFB84D;">{expire_min} minutes</strong>.</p>
          <p style="color:#4A5568;font-size:11px;margin:0;">If you didn't request this, ignore this email safely.</p>
        </div>
        <div style="padding:16px;border-top:1px solid #2A3450;text-align:center;">
          <p style="color:#4A5568;font-size:11px;margin:0;">Vayu Varta — AI Weather Intelligence</p>
        </div>
      </div>
    </body>
    </html>
    """


async def _send_reset_email(email: str, token: str, user_name: str) -> bool:
    """Send password reset email via SMTP. Returns True on success."""
    reset_url = f"{settings.frontend_url}/reset-password?token={token}"
    html = _reset_email_html(user_name, reset_url, settings.password_reset_expire_minutes)
    ok = await _send_email(email, "Vayu Varta — Reset Your Password", html)
    if ok:
        logger.info(f"Password reset email sent to: {email}")
    return ok


class ForgotPasswordRequest(BaseModel):
    email: EmailStr = Field(..., max_length=254)


class ResetPasswordRequest(BaseModel):
    token: str = Field(..., min_length=10, max_length=200)
    new_password: str = Field(..., min_length=8, max_length=128)

    @field_validator("new_password")
    @classmethod
    def validate_password_strength(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters long")
        if not re.search(r"[A-Z]", v):
            raise ValueError("Password must contain at least 1 uppercase letter")
        if not re.search(r"[a-z]", v):
            raise ValueError("Password must contain at least 1 lowercase letter")
        if not re.search(r"\d", v):
            raise ValueError("Password must contain at least 1 number")

        return v


@router.post("/forgot-password")
async def forgot_password(body: ForgotPasswordRequest):
    """
    Request a password reset link.
    Always returns success to prevent email enumeration.
    Failures are logged server-side so they never look like silent success.
    """
    email_lower = body.email.lower().strip()

    try:
        db = get_supabase()

        # Look up user (silently skip if not found — prevents email enumeration)
        result = (
            db.table("users")
            .select("id, name")
            .eq("email", email_lower)
            .limit(1)
            .execute()
        )

        if result.data:
            user = result.data[0]

            # Invalidate any existing reset tokens for this user
            db.table("password_reset_tokens").update({"used": True}).eq(
                "user_id", user["id"]
            ).eq("used", False).execute()

            # Generate new token
            raw_token = _generate_reset_token()
            token_hash = _hash_token(raw_token)
            expires_at = (
                datetime.now(timezone.utc)
                + timedelta(minutes=settings.password_reset_expire_minutes)
            ).isoformat()

            # Store hashed token in DB
            db.table("password_reset_tokens").insert({
                "user_id": user["id"],
                "token_hash": token_hash,
                "expires_at": expires_at,
                "used": False,
            }).execute()

            # Send email with raw token in URL
            ok = await _send_reset_email(email_lower, raw_token, user.get("name", "User"))
            if not ok:
                logger.error(
                    f"forgot-password: SMTP send FAILED for existing user {email_lower} "
                    f"(token row still stored). Check SMTP settings."
                )

            logger.info(f"Password reset requested for: {email_lower}")
    except Exception as exc:
        # Log the REAL failure loudly — the client still gets a generic 200
        # so attackers cannot tell which emails are registered.
        logger.exception(
            f"forgot-password: internal error for {email_lower} — email NOT sent: {type(exc).__name__}: {exc}"
        )

    # Always return success (prevents email enumeration)
    return {
        "message": "If that email is registered, you'll receive a reset link shortly."
    }


@router.post("/reset-password")
async def reset_password(body: ResetPasswordRequest):
    """
    Reset password using a valid token.
    Token must be: valid, not expired, not already used.
    """
    db = get_supabase()
    token_hash = _hash_token(body.token)

    # Find the token
    result = (
        db.table("password_reset_tokens")
        .select("id, user_id, expires_at, used")
        .eq("token_hash", token_hash)
        .limit(1)
        .execute()
    )

    if not result.data:
        raise HTTPException(
            status_code=400,
            detail="Invalid or expired reset link. Please request a new one."
        )

    token_row = result.data[0]

    # Check if already used
    if token_row["used"]:
        raise HTTPException(
            status_code=400,
            detail="This reset link has already been used. Please request a new one."
        )

    # Check expiry
    expires_at = datetime.fromisoformat(token_row["expires_at"].replace("Z", "+00:00"))
    if datetime.now(timezone.utc) > expires_at:
        raise HTTPException(
            status_code=400,
            detail="This reset link has expired. Please request a new one."
        )

    # Update password
    new_hash = hash_password(body.new_password)
    db.table("users").update({"password_hash": new_hash}).eq(
        "id", token_row["user_id"]
    ).execute()

    # Mark token as used
    db.table("password_reset_tokens").update({"used": True}).eq(
        "id", token_row["id"]
    ).execute()

    logger.info(f"Password reset completed for user: {token_row['user_id'][:8]}...")

    return {"message": "Password reset successful. You can now sign in with your new password."}
