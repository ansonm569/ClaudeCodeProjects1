// ==========================================
// Wedding Website Scripts
// ==========================================

document.addEventListener('DOMContentLoaded', () => {

    // ------------------------------------------
    // Countdown Timer
    // ------------------------------------------
    const countdownDays = document.getElementById('days');

    // Only run countdown if elements exist (on homepage)
    if (countdownDays) {
        const weddingDate = new Date('2027-04-17T16:00:00-07:00');

        function updateCountdown() {
            const now = new Date();
            const diff = weddingDate - now;

            if (diff <= 0) {
                document.getElementById('days').textContent = '0';
                document.getElementById('hours').textContent = '0';
                document.getElementById('minutes').textContent = '0';
                document.getElementById('seconds').textContent = '0';
                return;
            }

            const days = Math.floor(diff / (1000 * 60 * 60 * 24));
            const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
            const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
            const seconds = Math.floor((diff % (1000 * 60)) / 1000);

            document.getElementById('days').textContent = days;
            document.getElementById('hours').textContent = String(hours).padStart(2, '0');
            document.getElementById('minutes').textContent = String(minutes).padStart(2, '0');
            document.getElementById('seconds').textContent = String(seconds).padStart(2, '0');
        }

        updateCountdown();
        setInterval(updateCountdown, 1000);
    }

    // ------------------------------------------
    // Navbar scroll effect
    // ------------------------------------------
    const navbar = document.getElementById('navbar');

    function handleNavScroll() {
        if (window.scrollY > 80) {
            navbar.classList.add('scrolled');
        } else {
            navbar.classList.remove('scrolled');
        }
    }

    window.addEventListener('scroll', handleNavScroll, { passive: true });
    handleNavScroll();

    // ------------------------------------------
    // Mobile menu toggle
    // ------------------------------------------
    const navToggle = document.querySelector('.nav-toggle');
    const navLinks = document.querySelector('.nav-links');

    navToggle.addEventListener('click', () => {
        navLinks.classList.toggle('open');
    });

    // Close menu when a link is clicked
    navLinks.querySelectorAll('a').forEach(link => {
        link.addEventListener('click', () => {
            navLinks.classList.remove('open');
        });
    });

    // Close menu when clicking outside
    document.addEventListener('click', (e) => {
        if (!navToggle.contains(e.target) && !navLinks.contains(e.target)) {
            navLinks.classList.remove('open');
        }
    });

    // ------------------------------------------
    // Scroll reveal animations
    // ------------------------------------------
    const fadeElements = document.querySelectorAll(
        '.timeline-item, .detail-card, .schedule-item, .gallery-item'
    );

    fadeElements.forEach(el => el.classList.add('fade-in'));

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
                observer.unobserve(entry.target);
            }
        });
    }, {
        threshold: 0.15,
        rootMargin: '0px 0px -40px 0px'
    });

    fadeElements.forEach(el => observer.observe(el));

    // ------------------------------------------
    // Guest List & Lookup
    // ------------------------------------------
    // Guest list is loaded from guestlist.js
    let guestList = typeof guestListData !== 'undefined' ? guestListData : [];
    let currentGuest = null;

    // Get all DOM elements first (before any returns)
    const lookupForm = document.getElementById('lookup-form');
    const lookupError = document.getElementById('lookup-error');
    const lookupContainer = document.getElementById('lookup-container');
    const rsvpContainer = document.getElementById('rsvp-container');
    const guestInfo = document.getElementById('guest-info');
    const rsvpForm = document.getElementById('rsvp-form');
    const rsvpSuccess = document.getElementById('rsvp-success');
    const dietaryGroup = document.getElementById('dietary-group');
    const songGroup = document.getElementById('song-group');

    // Only run lookup functionality if elements exist (on RSVP page)
    if (!lookupForm) return;

    // If arriving via edit link (?guestId=X), skip the search and load existing RSVP
    const urlParams = new URLSearchParams(window.location.search);
    const preloadGuestId = parseInt(urlParams.get('guestId'));
    if (preloadGuestId && guestList.length > 0) {
        const preloadGuest = guestList.find(g => g.id === preloadGuestId);
        if (preloadGuest) {
            fetch(`/api/rsvp?guestId=${preloadGuestId}`)
                .then(r => r.ok ? r.json() : null)
                .then(existingRsvp => showRSVPForm(preloadGuest, existingRsvp))
                .catch(() => showRSVPForm(preloadGuest, null));
        }
    }

    lookupForm.addEventListener('submit', (e) => {
        e.preventDefault();

        const firstName = document.getElementById('lookup-firstname').value.trim().toLowerCase();
        const lastName = document.getElementById('lookup-lastname').value.trim().toLowerCase();

        // Validate that at least one field is filled
        if (!firstName && !lastName) {
            lookupError.innerHTML = '<p>Please enter at least your first name or last name.</p>';
            lookupError.classList.remove('hidden');
            return;
        }

        // Flexible search - find matches
        let matches = guestList.filter(guest => {
            const guestFirst = guest.firstName.toLowerCase();
            const guestLast = guest.lastName.toLowerCase();

            // If both names provided, check both
            if (firstName && lastName) {
                return (guestFirst.includes(firstName) || firstName.includes(guestFirst)) &&
                       (guestLast.includes(lastName) || lastName.includes(guestLast));
            }
            // If only first name provided
            else if (firstName && !lastName) {
                return guestFirst.includes(firstName) || firstName.includes(guestFirst);
            }
            // If only last name provided
            else if (!firstName && lastName) {
                return guestLast.includes(lastName) || lastName.includes(guestLast);
            }
            return false;
        });

        // Sort by best match (exact matches first, then partial)
        matches.sort((a, b) => {
            const aFirstExact = firstName && a.firstName.toLowerCase() === firstName;
            const aLastExact = lastName && a.lastName.toLowerCase() === lastName;
            const bFirstExact = firstName && b.firstName.toLowerCase() === firstName;
            const bLastExact = lastName && b.lastName.toLowerCase() === lastName;

            const aScore = (aFirstExact ? 2 : 0) + (aLastExact ? 2 : 0);
            const bScore = (bFirstExact ? 2 : 0) + (bLastExact ? 2 : 0);

            return bScore - aScore;
        });

        if (matches.length >= 1) {
            // Show selection to confirm (even for single match)
            showGuestSelection(matches);
        } else {
            // No matches found
            lookupError.innerHTML = '<p>We couldn\'t find your reservation. Please check your spelling or try just your first or last name.</p>';
            lookupError.classList.remove('hidden');
        }
    });

    function showGuestSelection(matches) {
        lookupError.classList.add('hidden');

        // Group matches by groupCode to show complete parties
        const partyMap = new Map();
        matches.forEach(guest => {
            if (!partyMap.has(guest.groupCode)) {
                // Get all members of this party
                const partyMembers = guestList.filter(g => g.groupCode === guest.groupCode);
                partyMap.set(guest.groupCode, {
                    primaryGuest: guest,
                    members: partyMembers
                });
            }
        });

        const parties = Array.from(partyMap.values());
        const headerText = parties.length === 1
            ? 'Is this your party? Please confirm:'
            : 'Multiple parties found. Please select yours:';

        // Create selection UI showing complete parties
        const selectionHTML = `
            <div class="guest-selection">
                <h4>${headerText}</h4>
                <div class="guest-list">
                    ${parties.map(party => {
                        const partyNames = party.members.map(m => `${m.firstName} ${m.lastName}`).join(' & ');
                        const partySize = party.members.length;
                        const partyLabel = partySize > 1
                            ? `${partyNames} (Party of ${partySize})`
                            : partyNames;

                        return `
                            <button type="button" class="guest-option" data-guest-id="${party.primaryGuest.id}">
                                ${partyLabel}
                            </button>
                        `;
                    }).join('')}
                </div>
            </div>
        `;

        lookupError.innerHTML = selectionHTML;
        lookupError.classList.remove('hidden');

        // Add click handlers to guest options
        document.querySelectorAll('.guest-option').forEach(button => {
            button.addEventListener('click', () => {
                const guestId = parseInt(button.dataset.guestId);
                currentGuest = guestList.find(g => g.id === guestId);
                showRSVPForm(currentGuest);
            });
        });
    }

    function showRSVPForm(guest, existingRsvp = null) {
        lookupError.classList.add('hidden');
        lookupContainer.style.display = 'none';
        rsvpContainer.classList.remove('hidden');

        // Find all party members with the same groupCode
        const partyMembers = guestList.filter(g => g.groupCode === guest.groupCode);
        currentGuest = { ...guest, partyMembers };

        // Display guest and party information
        const partyNames = partyMembers.map(g => `${g.firstName} ${g.lastName}`).join(' & ');
        guestInfo.innerHTML = `
            <h3>Welcome, ${guest.firstName}!</h3>
            <p class="party-size-info">Your party: <strong>${partyNames}</strong></p>
            <p class="party-size-info">${partyMembers.length} ${partyMembers.length === 1 ? 'guest' : 'guests'} total</p>
        `;

        // Set guest ID
        document.getElementById('guest-id').value = guest.id;

        // Generate party attendance checkboxes
        const partyAttendanceContainer = document.getElementById('party-attendance-container');
        partyAttendanceContainer.innerHTML = `
            <div class="event-section">
                <h4 class="event-title">Welcome Drinks</h4>
                <p class="event-details">April 16, 2027 at 7:00 PM</p>
                <div class="checkbox-group">
                    ${partyMembers.map(member => `
                        <label class="checkbox-label">
                            <input type="checkbox" name="welcome-${member.id}" data-guest-id="${member.id}" data-event="welcome" class="party-checkbox">
                            <span class="checkbox-custom"></span>
                            ${member.firstName} ${member.lastName}
                        </label>
                    `).join('')}
                </div>
            </div>
            <div class="event-section">
                <h4 class="event-title">Wedding Ceremony & Reception</h4>
                <p class="event-details">April 17, 2027 at 4:00 PM</p>
                <div class="checkbox-group">
                    ${partyMembers.map(member => `
                        <label class="checkbox-label">
                            <input type="checkbox" name="wedding-${member.id}" data-guest-id="${member.id}" data-event="wedding" class="party-checkbox">
                            <span class="checkbox-custom"></span>
                            ${member.firstName} ${member.lastName}
                        </label>
                    `).join('')}
                </div>
            </div>
        `;

        // Show/hide dietary and song fields based on checkbox selection
        const partyCheckboxes = document.querySelectorAll('.party-checkbox');
        const toggleConditionalFields = () => {
            const anyChecked = Array.from(partyCheckboxes).some(cb => cb.checked);
            if (dietaryGroup) dietaryGroup.style.display = anyChecked ? 'block' : 'none';
            if (songGroup) songGroup.style.display = anyChecked ? 'block' : 'none';
        };

        partyCheckboxes.forEach(cb => cb.addEventListener('change', toggleConditionalFields));
        toggleConditionalFields();

        // Pre-fill from existing RSVP (e.g. returning via edit link)
        if (existingRsvp) {
            document.getElementById('guest-email').value = existingRsvp.email || '';
            document.getElementById('dietary').value = existingRsvp.dietary_restrictions || '';
            document.getElementById('song').value = existingRsvp.song_request || '';
            document.getElementById('message').value = existingRsvp.message || '';

            // Pre-check attendance boxes
            const attendance = existingRsvp.party_attendance || {};
            partyCheckboxes.forEach(cb => {
                const gId = cb.dataset.guestId;
                const evt = cb.dataset.event;
                if (evt === 'welcome' && attendance[gId]?.welcomeDrinks) cb.checked = true;
                if (evt === 'wedding' && attendance[gId]?.wedding) cb.checked = true;
            });
            toggleConditionalFields();

            // Show a banner so they know they're editing
            const banner = document.createElement('p');
            banner.style.cssText = 'background:#e8f0e0;border:1px solid #c0d4b0;border-radius:6px;padding:10px 16px;font-size:0.9rem;margin-bottom:16px;color:#3d5a30;';
            banner.textContent = 'You\'ve already submitted an RSVP. You can update it below and resubmit.';
            rsvpContainer.querySelector('.rsvp-form')?.prepend(banner);
        }

        // Scroll to RSVP form
        rsvpContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    // ------------------------------------------
    // RSVP Form handling
    // ------------------------------------------
    // DOM elements already declared above

    // Only run RSVP functionality if elements exist (on RSVP page)
    if (!rsvpForm) return;

    // Form submission
    rsvpForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        // Collect party attendance data
        const partyCheckboxes = document.querySelectorAll('.party-checkbox');
        const anyEventSelected = Array.from(partyCheckboxes).some(cb => cb.checked);

        if (!anyEventSelected) {
            alert('Please select at least one person for at least one event.');
            return;
        }

        const formData = new FormData(rsvpForm);

        // Build party attendance map: { [guestId]: { welcomeDrinks, wedding } }
        const partyAttendance = {};
        partyCheckboxes.forEach(cb => {
            const guestId = cb.dataset.guestId;
            const event = cb.dataset.event;
            if (!partyAttendance[guestId]) {
                partyAttendance[guestId] = { welcomeDrinks: false, wedding: false };
            }
            if (event === 'welcome' && cb.checked) partyAttendance[guestId].welcomeDrinks = true;
            if (event === 'wedding' && cb.checked) partyAttendance[guestId].wedding = true;
        });

        // Build party members array with names (for email)
        const partyMembersForApi = currentGuest.partyMembers.map(m => ({
            id: String(m.id),
            name: `${m.firstName} ${m.lastName}`
        }));

        const payload = {
            groupCode: currentGuest.groupCode,
            primaryGuestId: parseInt(formData.get('guestId')),
            primaryGuestName: `${currentGuest.firstName} ${currentGuest.lastName}`,
            email: formData.get('email'),
            partyMembers: partyMembersForApi,
            partyAttendance,
            dietaryRestrictions: formData.get('dietary') || null,
            songRequest: formData.get('song') || null,
            message: formData.get('message') || null
        };

        // Disable submit button while sending
        const submitBtn = rsvpForm.querySelector('button[type="submit"]');
        const originalText = submitBtn.textContent;
        submitBtn.disabled = true;
        submitBtn.textContent = 'Sending…';

        try {
            const response = await fetch('/api/rsvp', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) throw new Error('Server error');

            // Show success
            rsvpContainer.classList.add('hidden');
            rsvpSuccess.classList.remove('hidden');
            rsvpSuccess.scrollIntoView({ behavior: 'smooth', block: 'center' });

        } catch (err) {
            console.error('RSVP submission error:', err);
            submitBtn.disabled = false;
            submitBtn.textContent = originalText;
            alert('Something went wrong submitting your RSVP. Please try again or contact us directly.');
        }
    });

    // ------------------------------------------
    // Gallery Lightbox
    // ------------------------------------------
    const lightbox = document.getElementById('lightbox');
    const lightboxImg = document.getElementById('lightbox-img');
    const lightboxCounter = document.querySelector('.lightbox-counter');
    const galleryItems = document.querySelectorAll('.gallery-item');
    const galleryPhotos = document.querySelectorAll('.gallery-photo');
    let currentIndex = 0;

    if (lightbox && galleryItems.length > 0 && galleryPhotos.length > 0) {
        // Add click handlers to all gallery items
        galleryItems.forEach((item, index) => {
            item.addEventListener('click', () => {
                currentIndex = index;
                openLightbox();
            });
        });

        // Close button
        const closeBtn = document.querySelector('.lightbox-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', closeLightbox);
        }

        // Previous button
        const prevBtn = document.querySelector('.lightbox-prev');
        if (prevBtn) {
            prevBtn.addEventListener('click', showPrevImage);
        }

        // Next button
        const nextBtn = document.querySelector('.lightbox-next');
        if (nextBtn) {
            nextBtn.addEventListener('click', showNextImage);
        }

        // Close on background click
        lightbox.addEventListener('click', (e) => {
            if (e.target === lightbox) {
                closeLightbox();
            }
        });

        // Keyboard navigation
        document.addEventListener('keydown', (e) => {
            if (!lightbox.classList.contains('hidden')) {
                if (e.key === 'Escape') closeLightbox();
                if (e.key === 'ArrowLeft') showPrevImage();
                if (e.key === 'ArrowRight') showNextImage();
            }
        });

        function openLightbox() {
            updateLightboxImage();
            lightbox.classList.remove('hidden');
            document.body.style.overflow = 'hidden';
        }

        function closeLightbox() {
            lightbox.classList.add('hidden');
            document.body.style.overflow = '';
        }

        function showPrevImage() {
            currentIndex = (currentIndex - 1 + galleryPhotos.length) % galleryPhotos.length;
            updateLightboxImage();
        }

        function showNextImage() {
            currentIndex = (currentIndex + 1) % galleryPhotos.length;
            updateLightboxImage();
        }

        function updateLightboxImage() {
            lightboxImg.src = galleryPhotos[currentIndex].src;
            lightboxImg.alt = galleryPhotos[currentIndex].alt;
            if (lightboxCounter) {
                lightboxCounter.textContent = `${currentIndex + 1} / ${galleryPhotos.length}`;
            }
        }
    }

    // ------------------------------------------
    // Smooth scroll for nav links (fallback)
    // ------------------------------------------
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            const target = document.querySelector(this.getAttribute('href'));
            if (target) {
                e.preventDefault();
                target.scrollIntoView({ behavior: 'smooth' });
            }
        });
    });

});
