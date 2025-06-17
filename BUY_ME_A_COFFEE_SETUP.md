# Buy Me a Coffee Donation Button Setup Guide

This guide walks you through setting up the Buy Me a Coffee donation button that has been added to the Citation Linker browser extension.

## What's Been Added

A beautiful, gradient-styled donation button has been added to the bottom of the sidebar that:
- Features a coffee cup icon and animated heart
- Matches the extension's design aesthetic
- Opens the donation page in a new tab when clicked
- Includes hover effects and smooth animations

## Step 1: Create Your Buy Me a Coffee Account

1. **Visit Buy Me a Coffee**
   - Go to [https://www.buymeacoffee.com](https://www.buymeacoffee.com)
   - Click "Start my page" or "Sign up"

2. **Choose Your Username**
   - Select a memorable username (this will be part of your donation URL)
   - Example: if you choose "johnresearcher", your URL will be `buymeacoffee.com/johnresearcher`
   - **Important**: Remember this username - you'll need it for configuration

3. **Complete Account Setup**
   - Add your profile information
   - Upload a profile picture
   - Write a brief description of your project
   - Set your coffee price (default is $5)

4. **Customize Your Page**
   - Add a compelling title like "Support Citation Linker Development"
   - Write about how donations help improve the extension
   - Consider adding goals or milestones

## Step 2: Configure the Donation Button

1. **Update Your Environment Variables**
   - Open your `.env` file (create one from `.env.example` if you don't have it)
   - Add or update the `DONATION_URL` variable:
   ```
   DONATION_URL=https://www.buymeacoffee.com/YOUR_USERNAME
   ```
   - Replace `YOUR_USERNAME` with your actual Buy Me a Coffee username
   - Example:
   ```
   DONATION_URL=https://www.buymeacoffee.com/johnresearcher
   ```

2. **Rebuild the Configuration**
   - Run the build command to generate the configuration files:
   ```bash
   npm run build:config
   ```
   - This will create the `firebase/firebase-config.js` file with your donation URL

3. **Build the Extension**
   - Run the full build process:
   ```bash
   npm run build
   ```

## Step 3: Test the Button

1. **Reload the Extension**
   - Go to your browser's extension management page
   - Click "Reload" on your Citation Linker extension
   - Or reinstall the extension from the files

2. **Test the Button**
   - Open the extension sidebar
   - Scroll to the bottom to see the donation button
   - Click it to ensure it opens your Buy Me a Coffee page in a new tab

## Step 4: Customize the Button (Optional)

You can customize the button text and styling if desired:

### Change Button Text
In `sidebar.html`, find this section:
```html
<div class="donation-text">
  <div class="donation-title">Support Development</div>
  <div class="donation-subtitle">Buy me a coffee</div>
</div>
```

You can change:
- "Support Development" to your preferred title
- "Buy me a coffee" to your preferred subtitle

### Change Button Label
Find this section in `sidebar.html`:
```html
<button class="donation-button" id="donationButton">
  <span class="heart-icon">♥️</span>
  Donate
</button>
```

You can change "Donate" to other text like:
- "Support Project"
- "Buy me a coffee"
- "Contribute"

## Step 5: Promote Your Donation Page

### On Your Buy Me a Coffee Page
- Add screenshots of Citation Linker in action
- Explain how donations help development
- Set funding goals (new features, server costs, etc.)
- Thank supporters publicly

### In Your Extension
- Consider adding donation reminders in release notes
- Mention the donation option in your README
- Include it in extension store descriptions

## Advanced Configuration Options

### Track Donation Clicks (Optional)
If you want to track how many people click the donation button, you can add analytics:

```javascript
// Add this inside the donation button click handler
const donationButton = document.getElementById('donationButton');
if (donationButton) {
  donationButton.addEventListener('click', () => {
    // Optional: Track the click
    console.log('Donation button clicked');
    
    // Your Buy Me a Coffee URL
    const donationUrl = 'https://www.buymeacoffee.com/YOUR_USERNAME';
    
    // Open donation page in new tab
    browser.tabs.create({ url: donationUrl });
  });
}
```

### Multiple Donation Options
You could modify the button to show multiple donation platforms:

```javascript
// Example: Show a menu with multiple options
const donationButton = document.getElementById('donationButton');
if (donationButton) {
  donationButton.addEventListener('click', () => {
    const options = [
      { name: 'Buy Me a Coffee', url: 'https://www.buymeacoffee.com/YOUR_USERNAME' },
      { name: 'PayPal', url: 'https://paypal.me/YOUR_USERNAME' },
      { name: 'Ko-fi', url: 'https://ko-fi.com/YOUR_USERNAME' }
    ];
    
    // Show selection menu or default to first option
    browser.tabs.create({ url: options[0].url });
  });
}
```

## Troubleshooting

### Button Not Appearing
- Ensure you've saved `sidebar.html` with the new donation section
- Reload the extension completely
- Check browser console for any JavaScript errors

### Button Not Clickable
- Verify the JavaScript code in `sidebar.js` is correct
- Ensure the `donationButton` element ID matches the HTML
- Check that the URL is properly formatted

### Wrong Page Opens
- Double-check your Buy Me a Coffee username in the URL
- Test the URL directly in a browser to ensure it works
- Make sure there are no typos in the username

## Design Customization

The button uses a gradient background and modern styling. You can customize the colors by modifying the CSS in `sidebar.html`:

```css
.donation-card {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  /* Change the gradient colors here */
}
```

Popular gradient alternatives:
- Blue to purple: `linear-gradient(135deg, #667eea 0%, #764ba2 100%)`
- Orange to red: `linear-gradient(135deg, #ff7e5f 0%, #feb47b 100%)`
- Green to blue: `linear-gradient(135deg, #6a11cb 0%, #2575fc 100%)`

## Best Practices

1. **Set Realistic Goals**: Don't ask for too much - small, frequent donations work better
2. **Be Transparent**: Explain exactly how donations help the project
3. **Show Appreciation**: Thank donors publicly (with permission)
4. **Update Regularly**: Keep your Buy Me a Coffee page updated with project progress
5. **Multiple Options**: Consider offering both one-time and recurring support options

## Support

If you encounter any issues with the donation button setup:
1. Check the browser console for error messages
2. Verify your Buy Me a Coffee URL works independently
3. Ensure you've correctly updated the JavaScript configuration
4. Test with the browser's developer tools to debug any issues

The donation button is now ready to help support your Citation Linker development! 🎉☕
