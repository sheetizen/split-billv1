/**
 * Backend function yang berjalan di Cloudflare.
 * Bertindak sebagai proxy aman untuk API Gemini.
 *
 * @param {object} context - Konteks dari Cloudflare Function.
 */
export async function onRequest(context) {
  // Hanya izinkan metode POST
  if (context.request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  try {
    // 1. Ambil data gambar dari frontend
    const { imageDataUrl } = await context.request.json();
    if (!imageDataUrl) {
      return new Response('Image data is required', { status: 400 });
    }

    // 2. Ambil API Key dari environment variable rahasia di Cloudflare
    const GEMINI_API_KEY = context.env.GEMINI_API_KEY;
    if (!GEMINI_API_KEY) {
        return new Response('API Key not configured on server', { status: 500 });
    }

    // 3. Siapkan data untuk dikirim ke Google Gemini API
    const imagePart = {
      inlineData: {
        data: imageDataUrl.split(',')[1],
        mimeType: 'image/jpeg',
      },
    };

    const prompt = `
        Analisis struk belanja ini. Ekstrak informasi berikut dalam format JSON tunggal:
        1.  \`items\`: Array dari semua item MAKANAN/MINUMAN. Setiap objek harus memiliki "item" (string) dan "jumlah" (number). Jika harga satuan jelas, tambahkan "harga" (number).
        2.  \`subtotal_item\`: Angka subtotal HANYA untuk item makanan/minuman.
        3.  \`other_costs\`: Array dari SEMUA biaya lain atau diskon. Setiap objek harus memiliki "name" (string, e.g., "Biaya Pengiriman", "Voucher Diskon") dan "amount" (number). Diskon harus bernilai negatif.
        4.  \`total_akhir\`: Angka total final yang harus dibayar.
        Berikan HANYA JSON sebagai output.
    `;
    
    const requestBody = {
      contents: [{ parts: [ {text: prompt}, imagePart ] }],
    };

    // 4. Panggil Google Gemini API dari backend
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`;
    
    const geminiResponse = await fetch(geminiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    if (!geminiResponse.ok) {
      const errorText = await geminiResponse.text();
      console.error('Gemini API Error:', errorText);
      return new Response(`Error from Gemini API: ${errorText}`, { status: geminiResponse.status });
    }

    const geminiData = await geminiResponse.json();

    // 5. Kirim kembali respons dari Gemini ke frontend
    return new Response(JSON.stringify(geminiData), {
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Internal Server Error:', error);
    return new Response(`Internal Server Error: ${error.message}`, { status: 500 });
  }
}
