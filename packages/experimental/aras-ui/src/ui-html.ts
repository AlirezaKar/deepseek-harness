/**
 * Single-page HTML shell builder for the Aras Smart Assistant (`دستیار هوشمند ارس`) UI.
 *
 * @module @deepseek-ai/dsh-aras-ui/ui-html
 */

import { ARAS_UI_SCRIPT } from './ui-script.ts'
import { ARAS_UI_STYLES } from './ui-styles.ts'

/**
 * Render the complete `index.html` document for the Aras Smart Assistant UI.
 * @returns UTF-8 HTML document string.
 */
export function renderArasIndexHtml(): string {
  return `<!DOCTYPE html>
<html lang="fa" dir="rtl" data-theme="dark">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>دستیار هوشمند ارس</title>
  <style>${ARAS_UI_STYLES}</style>
</head>
<body>
  <div class="aras-shell">
    <!-- Top Header Bar -->
    <header class="aras-topbar">
      <!-- First child in RTL sits on the RIGHT -->
      <button type="button" id="aras-sidebar-toggle" class="aras-menu-btn" aria-label="تغییر وضعیت منو" title="نمایش / پنهان کردن منو">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <line x1="4" y1="7" x2="20" y2="7"></line>
          <line x1="4" y1="12" x2="20" y2="12"></line>
          <line x1="10" y1="17" x2="20" y2="17"></line>
        </svg>
      </button>

      <!-- Centered Title -->
      <div class="aras-topbar-title">دستیار هوشمند ارس</div>

      <!-- Last child in RTL sits on the LEFT (RS Logo) -->
      <div class="aras-brand-logo" aria-label="Aras RS">
        <svg width="46" height="34" viewBox="0 0 64 44" fill="none" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="arasRsGrad" x1="6" y1="6" x2="56" y2="38" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stop-color="#1E66F5" />
              <stop offset="100%" stop-color="#60A5FA" />
            </linearGradient>
          </defs>
          <ellipse cx="33" cy="23" rx="26" ry="13" transform="rotate(-16 33 23)" stroke="url(#arasRsGrad)" stroke-width="2.2" stroke-opacity="0.45" />
          <path d="M13 31L17.5 12H27.2C31.2 12 33.4 13.9 32.8 17.1C32.3 19.7 30.3 21.4 27.6 22L31.2 31H26.4L23.2 22.4H19.6L17.6 31H13ZM20.4 18.8H25.5C27.4 18.8 28.5 18 28.8 16.7C29 15.5 28.1 14.9 26.3 14.9H21.3L20.4 18.8Z" fill="url(#arasRsGrad)" />
          <path d="M33.2 27.4L36.2 24.9C37.4 26.5 39.2 27.4 41.4 27.4C43.5 27.4 44.8 26.6 45 25.4C45.2 24.2 44.2 23.7 41.5 23C37.6 22.1 35.6 20.8 36.1 17.9C36.7 14.7 39.8 12.6 44.3 12.6C47.3 12.6 49.7 13.5 51.2 15.2L48.3 17.7C47.1 16.4 45.6 15.8 43.7 15.8C41.8 15.8 40.6 16.5 40.4 17.6C40.2 18.7 41.2 19.2 44 19.9C47.9 20.8 50 22.2 49.4 25.3C48.8 28.6 45.7 30.8 40.9 30.8C37.4 30.8 34.7 29.6 33.2 27.4Z" fill="#60A5FA" />
        </svg>
      </div>
    </header>

    <!-- Main Body -->
    <div class="aras-body">
      <!-- Right Navigation Sidebar -->
      <aside id="aras-sidebar" class="aras-sidebar">
        <nav class="aras-nav">
          <button type="button" class="aras-nav-item" data-nav-tab="dashboard">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
              <path d="M3 10.5L12 3l9 7.5"></path>
              <path d="M5 9.5V20h14V9.5"></path>
              <path d="M9.5 20v-6h5v6"></path>
            </svg>
            <span>پیشخوان</span>
          </button>

          <button type="button" class="aras-nav-item active" data-nav-tab="new-chat">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="9"></circle>
              <line x1="12" y1="8" x2="12" y2="12.5"></line>
              <circle cx="12" cy="16" r="0.8" fill="currentColor"></circle>
            </svg>
            <span>گفتگوی جدید</span>
          </button>

          <button type="button" class="aras-nav-item" data-nav-tab="chats">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
              <rect x="4" y="4" width="16" height="16" rx="3"></rect>
              <line x1="8" y1="9.5" x2="16" y2="9.5"></line>
              <line x1="8" y1="14.5" x2="13.5" y2="14.5"></line>
            </svg>
            <span>گفتگوها</span>
          </button>

          <button type="button" class="aras-nav-item" data-nav-tab="documents">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
              <path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8z"></path>
              <polyline points="14 3 14 8 19 8"></polyline>
              <line x1="9" y1="13" x2="15" y2="13"></line>
              <line x1="9" y1="17" x2="15" y2="17"></line>
            </svg>
            <span>اسناد</span>
          </button>

          <button type="button" class="aras-nav-item" data-nav-tab="databases">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
              <ellipse cx="12" cy="5" rx="8" ry="3"></ellipse>
              <path d="M4 5v14c0 1.66 3.58 3 8 3s8-1.34 8-3V5"></path>
              <path d="M4 12c0 1.66 3.58 3 8 3s8-1.34 8-3"></path>
            </svg>
            <span>پایگاه‌های داده</span>
          </button>

          <button type="button" class="aras-nav-item" data-nav-tab="faq">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
              <path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8z"></path>
              <polyline points="14 3 14 8 19 8"></polyline>
              <line x1="9" y1="12.5" x2="15" y2="12.5"></line>
              <line x1="9" y1="16.5" x2="13" y2="16.5"></line>
            </svg>
            <span>سوالات متداول</span>
          </button>

          <button type="button" class="aras-nav-item" data-nav-tab="settings">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="3"></circle>
              <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9c.26.6.77 1.02 1.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"></path>
            </svg>
            <span>تنظیمات سامانه</span>
          </button>

          <button type="button" class="aras-nav-item" data-nav-tab="uploader">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
              <path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8z"></path>
              <polyline points="14 3 14 8 19 8"></polyline>
            </svg>
            <span>آپلودر</span>
          </button>

          <div class="aras-nav-divider"></div>

          <button type="button" class="aras-nav-item" data-nav-tab="logout">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
              <path d="M15 3h4a2 2 0 012 2v14a2 2 0 01-2 2h-4"></path>
              <polyline points="10 17 15 12 10 7"></polyline>
              <line x1="15" y1="12" x2="3" y2="12"></line>
            </svg>
            <span>خروج</span>
          </button>
        </nav>

        <!-- Theme Segmented Footer (RTL: روشن | خودکار | تاریک) -->
        <div class="aras-sidebar-footer">
          <div class="aras-theme-switch" role="group" aria-label="انتخاب پوسته">
            <button type="button" class="aras-theme-btn" data-theme-btn="light">روشن</button>
            <button type="button" class="aras-theme-btn active" data-theme-btn="auto">خودکار</button>
            <button type="button" class="aras-theme-btn" data-theme-btn="dark">تاریک</button>
          </div>
        </div>
      </aside>

      <!-- Main Viewport -->
      <main class="aras-main">
        <!-- 1. Main Chat View -->
        <section class="aras-view active" data-view="chat">
          <div class="aras-chat-column">
            <div class="aras-chat-subheader">
              <!-- Spacer on right in RTL so left actions sit on the left -->
              <div style="width:1px;"></div>
              <div id="aras-chat-title" class="aras-chat-subheader-title">گفتگوی جدید</div>
              <div class="aras-subheader-actions-left">
                <button type="button" id="aras-active-model-pill" class="aras-subheader-model-pill" title="تغییر مدل هوش مصنوعی در تنظیمات">deepseek-official / deepseek-flash</button>
                <button type="button" id="aras-pdf-btn" class="aras-pdf-btn">خروجی PDF</button>
              </div>
            </div>

            <div id="aras-chat-scroll" class="aras-chat-scroll">
              <!-- Welcome Hero (exact match to Aras screenshot) -->
              <div id="aras-welcome-hero" class="aras-welcome-hero">
                <h1 class="aras-welcome-title">خوش آمدید!</h1>
                <p class="aras-welcome-subtitle">حالت خودکار فعال است؛ مسیر مناسب برای هر پیام به‌صورت هوشمند انتخاب می‌شود.</p>
                <div class="aras-mode-bar" role="tablist" aria-label="حالت مسیردهی پیام">
                  <button type="button" class="aras-mode-pill active" aria-selected="true">خودکار</button>
                  <button type="button" class="aras-mode-pill disabled" aria-disabled="true" title="غیرفعال — مسیردهی توسط ارکستریتور خودکار انجام می‌شود">عمومی</button>
                  <button type="button" class="aras-mode-pill disabled" aria-disabled="true" title="غیرفعال — مسیردهی توسط ارکستریتور خودکار انجام می‌شود">اسناد</button>
                  <button type="button" class="aras-mode-pill disabled" aria-disabled="true" title="غیرفعال — مسیردهی توسط ارکستریتور خودکار انجام می‌شود">اعداد</button>
                  <button type="button" class="aras-mode-pill disabled" aria-disabled="true" title="غیرفعال — مسیردهی توسط ارکستریتور خودکار انجام می‌شود">وب</button>
                </div>
              </div>

              <!-- Live Conversation Transcript -->
              <div id="aras-transcript" class="aras-transcript"></div>
            </div>

            <!-- Bottom Input Composer -->
            <div class="aras-composer-wrap">
              <div id="aras-attachment-strip" class="aras-attachment-strip"></div>
              <input id="aras-file-input" type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple style="display:none;" />

              <div id="aras-composer-pill" class="aras-composer-pill">
                <!-- Rightmost in RTL: Circular Send / Stop Button -->
                <button type="button" id="aras-send-btn" class="aras-send-btn" aria-label="ارسال پیام">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M3.4 20.4l17.45-7.48a1 1 0 000-1.84L3.4 3.6a.993.993 0 00-1.39.91L2 9.12c0 .5.37.93.87.99L17 12 2.87 13.88c-.5.07-.87.5-.87 1l.01 4.61c0 .71.73 1.2 1.39.91z"></path>
                  </svg>
                </button>

                <!-- Middle: Expanding RTL Textarea -->
                <textarea id="aras-composer-input" class="aras-composer-input" rows="1" maxlength="10000" placeholder="منتظر سوال شما هستم"></textarea>

                <!-- Leftmost in RTL: + Attachment Button -->
                <button type="button" id="aras-attach-btn" class="aras-attach-btn" title="افزودن تصویر" aria-label="افزودن تصویر">+</button>
              </div>

              <div class="aras-composer-footer">
                <div class="aras-composer-hint">با زدن Enter پیام ارسال می‌شود؛ Shift+Enter برای خط جدید.</div>
                <div id="aras-char-counter" class="aras-char-counter">۰ / ۱۰,۰۰۰ کاراکتر</div>
              </div>
            </div>
          </div>
        </section>

        <!-- 2. Conversations History View (گفتگوها) -->
        <section class="aras-view" data-view="chats">
          <div class="aras-page-scroll">
            <div class="aras-page-container">
              <div class="aras-page-header">
                <h2 class="aras-page-title">گفتگوهای پیشین</h2>
                <button type="button" class="aras-btn primary" data-nav-tab="new-chat">+ گفتگوی جدید</button>
              </div>
              <div id="aras-sessions-list" style="display:flex;flex-direction:column;gap:10px;"></div>
            </div>
          </div>
        </section>

        <!-- 3. Live Settings View (تنظیمات سامانه) -->
        <section class="aras-view" data-view="settings">
          <div class="aras-page-scroll">
            <div class="aras-page-container">
              <div class="aras-page-header">
                <h2 class="aras-page-title">تنظیمات سامانه و مدل‌های هوش مصنوعی</h2>
              </div>
              <div id="aras-settings-content" style="display:flex;flex-direction:column;gap:18px;">
                <div class="aras-card">در حال بارگذاری تنظیمات...</div>
              </div>
            </div>
          </div>
        </section>

        <!-- 4. Static Placeholder Views for Future Aras Backend Integration -->
        <section class="aras-view" data-view="dashboard">
          <div class="aras-page-scroll">
            <div class="aras-page-container">
              <div class="aras-page-header"><h2 class="aras-page-title">پیشخوان دستیار هوشمند ارس</h2></div>
              <div class="aras-card">
                <div class="aras-card-title">نمای کلی سامانه (نمایش ایستا)</div>
                <div class="aras-card-desc">هسته ارکستریتور و ابزارهای هوشمند DeepSeek Harness فعال است. برای شروع تعامل از بخش «گفتگوی جدید» و برای تنظیم کلیدهای API از بخش «تنظیمات سامانه» استفاده نمایید.</div>
              </div>
            </div>
          </div>
        </section>

        <section class="aras-view" data-view="documents">
          <div class="aras-page-scroll">
            <div class="aras-page-container">
              <div class="aras-page-header"><h2 class="aras-page-title">اسناد سازمانی</h2></div>
              <div class="aras-card">
                <div class="aras-card-title">مدیریت اسناد (نمایش ایستا)</div>
                <div class="aras-card-desc">این بخش در نسخه فعلی به‌صورت رابط ایستا قرار داده شده و در مرحله اتصال به بک‌اند اختصاصی شما فعال خواهد شد. در حال حاضر دستیار در «گفتگوی جدید» دسترسی مستقیم به فایل‌های محیط کاری دارد.</div>
              </div>
            </div>
          </div>
        </section>

        <section class="aras-view" data-view="databases">
          <div class="aras-page-scroll">
            <div class="aras-page-container">
              <div class="aras-page-header"><h2 class="aras-page-title">پایگاه‌های داده</h2></div>
              <div class="aras-card">
                <div class="aras-card-title">اتصال به منابع داده (نمایش ایستا)</div>
                <div class="aras-card-desc">صفحه مدیریت پایگاه‌های داده به‌صورت پوسته آماده نگه‌داری شده است تا در فاز بعدی به سرویس‌های داده اختصاصی سامانه ارس متصل گردد.</div>
              </div>
            </div>
          </div>
        </section>

        <section class="aras-view" data-view="faq">
          <div class="aras-page-scroll">
            <div class="aras-page-container">
              <div class="aras-page-header"><h2 class="aras-page-title">سوالات متداول</h2></div>
              <div class="aras-card">
                <div class="aras-card-title">چگونه کلید API و مدل هوش مصنوعی را تنظیم کنم؟</div>
                <div class="aras-card-desc">از منوی سمت راست وارد بخش «تنظیمات سامانه» شوید، کلید API خود (مانند DeepSeek، OpenAI یا Anthropic) را وارد و ذخیره کنید و سپس مدل دلخواه را انتخاب نمایید.</div>
              </div>
              <div class="aras-card">
                <div class="aras-card-title">چرا فقط حالت «خودکار» فعال است؟</div>
                <div class="aras-card-desc">زیرا موتور ارکستریتور DeepSeek Harness به‌صورت خودکار ابزارهای فایل، ترمینال، وب و زیرعامل‌ها را بر اساس نیاز هر پرسش انتخاب و اجرا می‌کند.</div>
              </div>
            </div>
          </div>
        </section>

        <section class="aras-view" data-view="uploader">
          <div class="aras-page-scroll">
            <div class="aras-page-container">
              <div class="aras-page-header"><h2 class="aras-page-title">آپلودر فایل</h2></div>
              <div class="aras-card">
                <div class="aras-card-title">بارگذاری مرکزی (نمایش ایستا)</div>
                <div class="aras-card-desc">این بخش برای اتصال آتی به سرویس بارگذاری اسناد در نظر گرفته شده است. برای ارسال تصویر در گفتگو می‌توانید از دکمه «+» در کادر پیام استفاده کنید.</div>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  </div>

  <div id="aras-toast" class="aras-toast" role="status" aria-live="polite"></div>
  <script>${ARAS_UI_SCRIPT}</script>
</body>
</html>`
}
